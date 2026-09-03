import express from 'express';
import { supabase } from '../supabaseClient';
import { notifyCookVerificationMoreInfo, notifyCookVerificationReviewed } from '../notifications';
import { writeAdminAudit } from '../adminAudit';
import { requireAdmin, type AdminRequest } from '../middleware/requireAdmin';

const router = express.Router();

const BUCKET = 'food-safety-licenses';
const REQUIRED_COMPLIANCE_DOC_TYPES = [
  'fosim_registration',
  'food_handler_certificate',
  'typhoid_vaccination',
];

const DOC_LABELS: Record<string, string> = {
  fosim_registration: 'FoSIM food premises registration',
  food_handler_certificate: 'MOH Food Handler Certificate',
  typhoid_vaccination: 'anti-typhoid vaccination record',
};

// GET /status/:userId - A cook's verification tier + document statuses.
router.get('/status/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('verification_tier, is_verified')
      .eq('user_id', userId)
      .single();
    if (profileErr) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { data: documents, error: docsErr } = await supabase
      .from('verification_documents')
      .select('id, doc_type, status, reviewer_note, submitted_at, reviewed_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    if (docsErr) {
      return res.status(400).json({ error: docsErr.message });
    }

    res.json({
      verification_tier: profile.verification_tier,
      is_verified: profile.is_verified,
      documents,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /pending - Admin review queue. Each document comes with a short-lived
// signed URL so the reviewer can view the file from the private bucket.
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const { data: documents, error } = await supabase
      .from('verification_documents')
      .select(
        'id, user_id, doc_type, storage_path, status, submitted_at, profiles ( full_name, restaurant_name )'
      )
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const withUrls = await Promise.all(
      (documents ?? []).map(async doc => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(doc.storage_path, 60 * 60);
        return { ...doc, file_url: signed?.signedUrl ?? null };
      })
    );

    res.json({ documents: withUrls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /document/:documentId/file - Generate a fresh, short-lived URL only
// after authenticating the administrator. The private storage path is never
// exposed to the browser as a permanent public URL.
router.get('/document/:documentId/file', requireAdmin, async (req: AdminRequest, res) => {
  const { documentId } = req.params;
  try {
    const { data: document, error } = await supabase
      .from('verification_documents')
      .select('id, user_id, doc_type, storage_path')
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw error;
    if (!document) return res.status(404).json({ error: 'Verification document not found.' });

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(document.storage_path, 10 * 60);
    if (signedError || !signed?.signedUrl) {
      throw signedError ?? new Error('A secure document link could not be created.');
    }

    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: document.user_id,
      action: 'verification_document_viewed',
      details: { documentId: document.id, documentType: document.doc_type },
    });

    res.json({ fileUrl: signed.signedUrl, expiresInSeconds: 10 * 60 });
  } catch (err: unknown) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Verification document could not be opened.',
    });
  }
});

// POST /review - Approve or reject a submitted document.
// Body: { document_id, decision: 'approved' | 'rejected', reviewer_note? }
// Document decisions feed an optional credential stage. At least one approved
// credential earns the public badge; cook selling approval is independent.
router.post('/review', requireAdmin, async (req: AdminRequest, res) => {
  const { document_id, decision, reviewer_note } = req.body as {
    document_id?: string;
    decision?: string;
    reviewer_note?: string;
  };

  if (!document_id || !decision) {
    return res.status(400).json({ error: 'document_id and decision are required' });
  }
  if (!['approved', 'rejected', 'more_info_requested'].includes(decision)) {
    return res.status(400).json({
      error: "decision must be 'approved', 'rejected', or 'more_info_requested'",
    });
  }
  if (decision !== 'approved' && !reviewer_note?.trim()) {
    return res.status(400).json({ error: 'reviewer_note is required for this decision' });
  }

  try {
    const { data: existingDocument, error: lookupError } = await supabase
      .from('verification_documents')
      .select('id, status, user_id')
      .eq('id', document_id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existingDocument) {
      return res.status(404).json({ error: 'Verification document not found.' });
    }
    if (existingDocument.user_id === req.admin!.userId) {
      return res.status(403).json({ error: 'Administrators cannot review their own documents.' });
    }
    const { data: application, error: applicationError } = await supabase
      .from('cook_applications')
      .select('identity_status')
      .eq('user_id', existingDocument.user_id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (application && application.identity_status !== 'approved') {
      return res.status(409).json({
        error: 'Complete and approve the identity review before food compliance review.',
      });
    }
    if (existingDocument.status !== 'pending') {
      return res.status(409).json({
        error: `This document has already been ${existingDocument.status.replace(/_/g, ' ')}. Refresh the user details before taking another action.`,
        currentStatus: existingDocument.status,
      });
    }

    const { data: doc, error: updateErr } = await supabase
      .from('verification_documents')
      .update({
        status: decision,
        reviewer_note: reviewer_note?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', document_id)
      .eq('status', 'pending')
      .select('id, user_id, doc_type')
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!doc) {
      const { data: latest } = await supabase
        .from('verification_documents')
        .select('status')
        .eq('id', document_id)
        .maybeSingle();
      return res.status(409).json({
        error: `This document was reviewed by another action${latest?.status ? ` and is now ${latest.status.replace(/_/g, ' ')}` : ''}. Refresh the user details and try again.`,
        currentStatus: latest?.status ?? null,
      });
    }

    let complianceStatus: string | undefined;
    if (REQUIRED_COMPLIANCE_DOC_TYPES.includes(doc.doc_type)) {
      const { data: latestDocuments, error: latestError } = await supabase
        .from('verification_documents')
        .select('doc_type, status, submitted_at')
        .eq('user_id', doc.user_id)
        .in('doc_type', REQUIRED_COMPLIANCE_DOC_TYPES)
        .order('submitted_at', { ascending: false });
      if (latestError) throw latestError;
      const latestByType = new Map<string, string>();
      for (const item of latestDocuments ?? []) {
        if (!latestByType.has(item.doc_type)) latestByType.set(item.doc_type, item.status);
      }
      const statuses = [...latestByType.values()];
      const anyApproved = statuses.includes('approved');
      complianceStatus = statuses.includes('more_info_requested')
        ? 'more_info_requested'
        : statuses.includes('pending')
          ? 'pending'
          : anyApproved
            ? 'approved'
            : 'rejected';
      const { error: applicationUpdateError } = await supabase
        .from('cook_applications')
        .update({
          compliance_status: complianceStatus,
          ...(complianceStatus !== 'pending'
            ? {
                compliance_reviewed_at: new Date().toISOString(),
                compliance_reviewed_by: req.admin!.userId,
              }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', doc.user_id);
      if (applicationUpdateError) throw applicationUpdateError;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          is_verified: anyApproved,
          verification_tier: anyApproved ? 1 : 0,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', doc.user_id);
      if (profileUpdateError) throw profileUpdateError;
    }

    // Tell the cook the outcome (best-effort — the review already landed).
    if (decision === 'more_info_requested') {
      await notifyCookVerificationMoreInfo(
        doc.user_id,
        DOC_LABELS[doc.doc_type] ?? 'food safety document',
        reviewer_note!.trim()
      );
    } else {
      await notifyCookVerificationReviewed(
        doc.user_id,
        DOC_LABELS[doc.doc_type] ?? 'food safety document',
        decision === 'approved',
        reviewer_note
      );
    }

    try {
      await writeAdminAudit({
        actorUserId: req.admin!.userId,
        targetUserId: doc.user_id,
        action: `verification_document_${decision}`,
        details: {
          documentId: doc.id,
          documentType: doc.doc_type,
          reviewerNote: reviewer_note?.trim() || null,
        },
      });
    } catch (auditError) {
      // The review has already landed. Do not tell the admin it failed and
      // encourage a duplicate decision merely because secondary audit logging
      // encountered a transient error.
      console.error('Verification review audit logging failed:', auditError);
    }

    res.json({
      message: `Document ${decision}`,
      document: doc,
      ...(complianceStatus !== undefined && { compliance_status: complianceStatus }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
