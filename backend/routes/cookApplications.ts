import express from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import { evaluateCookEligibility } from '../cookEligibility';
import { supabase } from '../supabaseClient';

const router = express.Router();
const IDENTITY_BUCKET = 'cook-identity-documents';
const CITIZENSHIP_TYPES = new Set(['malaysian_citizen', 'permanent_resident']);
const IDENTITY_TYPES = new Set(['mykad', 'mypr']);
const REQUIRED_COMPLIANCE_DOCS = [
  'fosim_registration',
  'food_handler_certificate',
  'typhoid_vaccination',
];

router.get('/status', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('cook_applications')
      .select(
        'status, identity_status, compliance_status, citizenship_type, submitted_at, reviewer_note, reverification_due_at'
      )
      .eq('user_id', req.account!.userId)
      .maybeSingle();
    if (error) throw error;
    res.json({
      application: data ?? null,
      eligibility: evaluateCookEligibility(data),
    });
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Cook application status is unavailable.',
    });
  }
});

// Finalises an onboarding submission after the client has uploaded the files.
// The API owns workflow states so a browser cannot self-approve an application.
router.post('/submit', requireActiveAccount, async (req: AccountRequest, res) => {
  const citizenshipType = String(req.body.citizenshipType ?? '');
  const documentType = String(req.body.documentType ?? '');
  const identityStoragePath = String(req.body.identityStoragePath ?? '');
  if (!CITIZENSHIP_TYPES.has(citizenshipType)) {
    return res
      .status(400)
      .json({ error: 'Only Malaysian citizens and permanent residents may apply.' });
  }
  const expectedDocumentType = citizenshipType === 'malaysian_citizen' ? 'mykad' : 'mypr';
  if (!IDENTITY_TYPES.has(documentType) || documentType !== expectedDocumentType) {
    return res.status(400).json({
      error: `A ${expectedDocumentType === 'mykad' ? 'MyKad' : 'MyPR'} document is required.`,
    });
  }
  if (!identityStoragePath.startsWith(`${req.account!.userId}/`)) {
    return res.status(400).json({ error: 'The identity upload path is invalid.' });
  }

  try {
    const { data: files, error: storageError } = await supabase.storage
      .from(IDENTITY_BUCKET)
      .list(req.account!.userId, { limit: 100 });
    if (storageError) throw storageError;
    const expectedName = identityStoragePath.slice(req.account!.userId.length + 1);
    if (!(files ?? []).some(file => file.name === expectedName)) {
      return res.status(400).json({ error: 'The uploaded identity document could not be found.' });
    }

    const { data: complianceDocs, error: docsError } = await supabase
      .from('verification_documents')
      .select('doc_type, status, submitted_at')
      .eq('user_id', req.account!.userId)
      .in('doc_type', REQUIRED_COMPLIANCE_DOCS)
      .order('submitted_at', { ascending: false });
    if (docsError) throw docsError;
    const latestCompliance = new Map<string, string>();
    for (const document of complianceDocs ?? []) {
      if (!latestCompliance.has(document.doc_type)) {
        latestCompliance.set(document.doc_type, document.status);
      }
    }
    const allComplianceSubmitted = REQUIRED_COMPLIANCE_DOCS.every(type =>
      latestCompliance.has(type)
    );
    const allComplianceApproved = REQUIRED_COMPLIANCE_DOCS.every(
      type => latestCompliance.get(type) === 'approved'
    );
    const latestStatuses = [...latestCompliance.values()];
    const complianceStatus = latestStatuses.includes('more_info_requested')
      ? 'more_info_requested'
      : latestStatuses.includes('rejected')
        ? 'rejected'
        : allComplianceApproved
          ? 'approved'
          : allComplianceSubmitted
            ? 'pending'
            : 'not_submitted';

    const { error: identityError } = await supabase.from('identity_verification_documents').insert({
      user_id: req.account!.userId,
      document_type: documentType,
      storage_path: identityStoragePath,
      status: 'pending',
    });
    if (identityError) throw identityError;

    const now = new Date().toISOString();
    const { data: existingApplication, error: existingApplicationError } = await supabase
      .from('cook_applications')
      .select('status')
      .eq('user_id', req.account!.userId)
      .maybeSingle();
    if (existingApplicationError) throw existingApplicationError;
    const applicationStatus =
      existingApplication?.status === 'reverification_required'
        ? 'reverification_required'
        : 'pending';
    const { data: application, error: applicationError } = await supabase
      .from('cook_applications')
      .upsert(
        {
          user_id: req.account!.userId,
          status: applicationStatus,
          identity_status: 'pending',
          compliance_status: complianceStatus,
          citizenship_type: citizenshipType,
          submitted_at: now,
          reviewer_note: null,
          rejected_at: null,
          rejected_by: null,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
      .select('status, identity_status, compliance_status, submitted_at')
      .single();
    if (applicationError) throw applicationError;

    const { error: roleError } = await supabase.from('user_roles').upsert(
      [
        { user_id: req.account!.userId, role: 'guest' },
        { user_id: req.account!.userId, role: 'cook' },
      ],
      { onConflict: 'user_id,role' }
    );
    if (roleError) throw roleError;

    res.status(201).json({ success: true, application });
  } catch (error: unknown) {
    console.error('Could not submit cook application:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Application failed.' });
  }
});

export default router;
