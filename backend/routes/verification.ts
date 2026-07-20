import express from 'express';
import { supabase } from '../supabaseClient';
import { notifyCookVerificationReviewed } from '../notifications';

const router = express.Router();

const BUCKET = 'food-safety-licenses';
const TIER1_DOC_TYPES = ['food_handler_certificate', 'typhoid_vaccination'];

const DOC_LABELS: Record<string, string> = {
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
router.get('/pending', async (req, res) => {
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

// POST /review - Approve or reject a submitted document.
// Body: { document_id, decision: 'approved' | 'rejected', reviewer_note? }
// Approving any Tier 1 document grants the Tier 1 "Verified" badge.
router.post('/review', async (req, res) => {
  const { document_id, decision, reviewer_note } = req.body as {
    document_id?: string;
    decision?: string;
    reviewer_note?: string;
  };

  if (!document_id || !decision) {
    return res.status(400).json({ error: 'document_id and decision are required' });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }
  if (decision === 'rejected' && !reviewer_note?.trim()) {
    return res.status(400).json({ error: 'reviewer_note is required when rejecting' });
  }

  try {
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
      .single();
    if (updateErr || !doc) {
      return res.status(404).json({ error: 'Pending document not found' });
    }

    let verification_tier: number | undefined;
    if (decision === 'approved' && TIER1_DOC_TYPES.includes(doc.doc_type)) {
      // Tier 1 badge: any one approved Tier 1 document is enough.
      const { data: profile, error: tierErr } = await supabase
        .from('profiles')
        .update({ verification_tier: 1, is_verified: true })
        .eq('user_id', doc.user_id)
        .lt('verification_tier', 1)
        .select('verification_tier')
        .maybeSingle();
      if (tierErr) {
        return res.status(400).json({ error: tierErr.message });
      }
      // maybeSingle() is null when the cook already held tier >= 1.
      verification_tier = profile?.verification_tier ?? undefined;
    }

    // Tell the cook the outcome (best-effort — the review already landed).
    await notifyCookVerificationReviewed(
      doc.user_id,
      DOC_LABELS[doc.doc_type] ?? 'food safety document',
      decision === 'approved',
      reviewer_note
    );

    res.json({
      message: `Document ${decision}`,
      document: doc,
      ...(verification_tier !== undefined && { verification_tier }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
