import express from 'express';
import type { User } from '@supabase/supabase-js';
import type { AdminRequest } from '../middleware/requireAdmin';
import { writeAdminAudit } from '../adminAudit';
import { evaluateCookEligibility } from '../cookEligibility';
import { supabase } from '../supabaseClient';

const router = express.Router();
const IDENTITY_BUCKET = 'cook-identity-documents';
const FILTERS = new Set(['all', 'active', 'inactive', 'pending', 'reverification', 'rejected']);
const SORTS = new Set(['newest', 'oldest', 'name_asc', 'name_desc']);

const compactId = (id: string) => id.split('-')[0].toUpperCase();
async function listAllAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function canReviewIdentity(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('id')
    .eq('user_id', userId)
    .eq('permission', 'identity_review')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function requireIdentityPermission(req: AdminRequest, res: express.Response) {
  if (await canReviewIdentity(req.admin!.userId)) return true;
  res.status(403).json({ error: 'Your administrator account cannot access identity documents.' });
  return false;
}

router.get('/', async (req: AdminRequest, res) => {
  try {
    const search = String(req.query.search ?? '')
      .trim()
      .toLowerCase();
    const filter = FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : 'all';
    const sort = SORTS.has(String(req.query.sort)) ? String(req.query.sort) : 'newest';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const [authUsers, rolesResult, profilesResult, applicationsResult, listingsResult] =
      await Promise.all([
        listAllAuthUsers(),
        supabase.from('user_roles').select('user_id').eq('role', 'cook'),
        supabase
          .from('profiles')
          .select(
            'id, user_id, full_name, profile_image, restaurant_name, address_locality, address_town, address_postcode, created_at, account_status, is_verified'
          ),
        supabase
          .from('cook_applications')
          .select(
            'user_id, status, identity_status, compliance_status, submitted_at, reverification_due_at'
          ),
        supabase.from('listings').select('cook_id, status, is_active'),
      ]);
    const firstError = [
      rolesResult.error,
      profilesResult.error,
      applicationsResult.error,
      listingsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const authById = new Map(authUsers.map(user => [user.id, user]));
    const profileByUser = new Map(
      (profilesResult.data ?? []).map(profile => [profile.user_id, profile])
    );
    const appByUser = new Map((applicationsResult.data ?? []).map(app => [app.user_id, app]));
    const listingCountByCook = new Map<string, number>();
    for (const listing of listingsResult.data ?? []) {
      listingCountByCook.set(listing.cook_id, (listingCountByCook.get(listing.cook_id) ?? 0) + 1);
    }

    let cooks = (rolesResult.data ?? []).flatMap(role => {
      const profile = profileByUser.get(role.user_id);
      if (!profile) return [];
      const auth = authById.get(role.user_id);
      const application = appByUser.get(role.user_id) ?? null;
      const eligibility = evaluateCookEligibility(application);
      return [
        {
          userId: role.user_id,
          profileId: profile.id,
          displayId: compactId(role.user_id),
          name: profile.full_name || 'Unnamed cook',
          restaurantName: profile.restaurant_name,
          email: auth?.email ?? '',
          avatarUrl: profile.profile_image,
          address:
            [profile.address_locality, profile.address_town, profile.address_postcode]
              .filter(Boolean)
              .join(', ') || 'Not provided',
          joinedAt: profile.created_at ?? auth?.created_at ?? new Date(0).toISOString(),
          accountStatus: profile.account_status ?? 'active',
          applicationStatus: application?.status ?? 'draft',
          identityStatus: application?.identity_status ?? 'not_submitted',
          complianceStatus: application?.compliance_status ?? 'not_submitted',
          reverificationDueAt: application?.reverification_due_at ?? null,
          eligibleToSell: eligibility.eligibleToSell,
          verified: Boolean(profile.is_verified),
          dishCount: listingCountByCook.get(profile.id) ?? 0,
        },
      ];
    });

    if (search) {
      cooks = cooks.filter(cook =>
        [cook.userId, cook.displayId, cook.name, cook.restaurantName ?? '', cook.email].some(
          value => value.toLowerCase().includes(search)
        )
      );
    }
    cooks = cooks.filter(cook => {
      if (filter === 'active') return cook.accountStatus === 'active' && cook.eligibleToSell;
      if (filter === 'inactive') return cook.accountStatus !== 'active';
      if (filter === 'pending') return cook.applicationStatus === 'pending';
      if (filter === 'reverification') return cook.applicationStatus === 'reverification_required';
      if (filter === 'rejected') return cook.applicationStatus === 'rejected';
      return true;
    });
    cooks.sort((a, b) => {
      if (sort === 'oldest') return +new Date(a.joinedAt) - +new Date(b.joinedAt);
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      return +new Date(b.joinedAt) - +new Date(a.joinedAt);
    });
    const allCooks = (rolesResult.data ?? []).map(role => {
      const profile = profileByUser.get(role.user_id);
      const application = appByUser.get(role.user_id) ?? null;
      return { profile, application, eligibility: evaluateCookEligibility(application) };
    });
    const total = cooks.length;
    const start = (page - 1) * pageSize;
    res.json({
      stats: {
        totalCooks: allCooks.length,
        activeCooks: allCooks.filter(
          cook => cook.profile?.account_status === 'active' && cook.eligibility.eligibleToSell
        ).length,
        pendingVerification: allCooks.filter(cook => cook.application?.status === 'pending').length,
        reverificationRequired: allCooks.filter(
          cook => cook.application?.status === 'reverification_required'
        ).length,
      },
      cooks: cooks.slice(start, start + pageSize),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error: unknown) {
    console.error('Could not load Cook Management:', error);
    res.status(500).json({ error: 'Cook management data could not be loaded.' });
  }
});

router.get('/:userId', async (req: AdminRequest, res) => {
  try {
    const { userId } = req.params;
    const identityAccess = await canReviewIdentity(req.admin!.userId);
    const [authResult, profileResult, applicationResult, complianceResult, identityResult] =
      await Promise.all([
        supabase.auth.admin.getUserById(userId),
        supabase
          .from('profiles')
          .select(
            'id, user_id, full_name, profile_image, phone_number, restaurant_name, bio, address_locality, address_town, address_postcode, created_at, account_status, is_verified, verification_tier, hosting_type'
          )
          .eq('user_id', userId)
          .maybeSingle(),
        supabase.from('cook_applications').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('verification_documents')
          .select('id, doc_type, status, reviewer_note, submitted_at, reviewed_at')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('identity_verification_documents')
          .select('id, document_type, status, reviewer_note, submitted_at, reviewed_at')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false }),
      ]);
    const profile = profileResult.data;
    if (authResult.error || !authResult.data.user || profileResult.error || !profile) {
      return res.status(404).json({ error: 'Cook not found.' });
    }
    const firstError = [applicationResult.error, complianceResult.error, identityResult.error].find(
      Boolean
    );
    if (firstError) throw firstError;
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, title, cuisine, status, is_active')
      .eq('cook_id', profile.id);
    if (listingsError) throw listingsError;
    const listingIds = (listings ?? []).map(listing => listing.id);
    const [ordersResult, reviewsResult] = await Promise.all([
      listingIds.length
        ? supabase
            .from('orders')
            .select('id, total_price, payment_status, status')
            .in('listing_id', listingIds)
        : Promise.resolve({ data: [], error: null }),
      listingIds.length
        ? supabase.from('reviews').select('rating').in('listing_id', listingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ordersResult.error || reviewsResult.error) throw ordersResult.error ?? reviewsResult.error;
    const paidOrders = (ordersResult.data ?? []).filter(
      order => order.payment_status === 'paid' && order.status !== 'cancelled'
    );
    const ratings = (reviewsResult.data ?? [])
      .map(review => Number(review.rating))
      .filter(Number.isFinite);
    res.json({
      cook: {
        userId,
        profileId: profile.id,
        displayId: compactId(userId),
        name: profile.full_name,
        restaurantName: profile.restaurant_name,
        email: authResult.data.user.email ?? '',
        phone: profile.phone_number,
        avatarUrl: profile.profile_image,
        bio: profile.bio,
        address:
          [profile.address_locality, profile.address_town, profile.address_postcode]
            .filter(Boolean)
            .join(', ') || 'Not provided',
        joinedAt: profile.created_at ?? authResult.data.user.created_at,
        lastSignInAt: authResult.data.user.last_sign_in_at ?? null,
        accountStatus: profile.account_status,
        verified: Boolean(profile.is_verified),
        verificationTier: profile.verification_tier,
        hostingType: profile.hosting_type,
      },
      application: applicationResult.data ?? null,
      summary: {
        ordersDone: (ordersResult.data ?? []).filter(order => order.status === 'completed').length,
        totalEarned: paidOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0),
        averageRating: ratings.length
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          : null,
        ratingCount: ratings.length,
        dishCount: listings?.length ?? 0,
      },
      listings: listings ?? [],
      complianceDocuments: complianceResult.data ?? [],
      identityDocuments: identityAccess ? (identityResult.data ?? []) : [],
      canReviewIdentity: identityAccess,
    });
  } catch (error: unknown) {
    console.error('Could not load cook details:', error);
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Cook details failed.' });
  }
});

router.get('/:userId/identity/:documentId/file', async (req: AdminRequest, res) => {
  try {
    if (!(await requireIdentityPermission(req, res))) return;
    const { data: document, error } = await supabase
      .from('identity_verification_documents')
      .select('id, user_id, document_type, storage_path')
      .eq('id', req.params.documentId)
      .eq('user_id', req.params.userId)
      .maybeSingle();
    if (error) throw error;
    if (!document) return res.status(404).json({ error: 'Identity document not found.' });
    const { data: signed, error: signedError } = await supabase.storage
      .from(IDENTITY_BUCKET)
      .createSignedUrl(document.storage_path, 5 * 60);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Secure link failed.');
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: document.user_id,
      action: 'identity_document_viewed',
      details: { documentId: document.id, documentType: document.document_type },
    });
    res.json({ fileUrl: signed.signedUrl, expiresInSeconds: 300 });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Document unavailable.' });
  }
});

router.post('/:userId/identity/:documentId/review', async (req: AdminRequest, res) => {
  const decision = String(req.body.decision ?? '');
  const reviewerNote = String(req.body.reviewerNote ?? '').trim();
  if (!['approved', 'rejected', 'more_info_requested'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid identity decision.' });
  }
  if (decision !== 'approved' && reviewerNote.length < 5) {
    return res.status(400).json({ error: 'A reviewer note is required.' });
  }
  try {
    if (req.admin!.userId === req.params.userId) {
      return res.status(403).json({ error: 'Administrators cannot review their own identity.' });
    }
    if (!(await requireIdentityPermission(req, res))) return;
    const { data: document, error } = await supabase
      .from('identity_verification_documents')
      .update({
        status: decision,
        reviewer_note: reviewerNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.admin!.userId,
      })
      .eq('id', req.params.documentId)
      .eq('user_id', req.params.userId)
      .eq('status', 'pending')
      .select('id, user_id, document_type')
      .maybeSingle();
    if (error) throw error;
    if (!document)
      return res.status(409).json({ error: 'This identity document is no longer pending.' });
    const { error: appError } = await supabase
      .from('cook_applications')
      .update({
        identity_status: decision,
        identity_reviewed_at: new Date().toISOString(),
        identity_reviewed_by: req.admin!.userId,
        reviewer_note: reviewerNote || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', req.params.userId);
    if (appError) throw appError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: req.params.userId,
      action: `cook_identity_${decision}`,
      details: { documentId: document.id, reviewerNote: reviewerNote || null },
    });
    if (decision !== 'approved') {
      await supabase.from('notifications').insert({
        user_id: req.params.userId,
        recipient_role: 'cook',
        type: 'verification_more_info',
        title:
          decision === 'rejected'
            ? 'Identity document rejected'
            : 'More identity information needed',
        body: reviewerNote,
        data: { route: '/(cook)/identity-verification', stage: 'identity' },
      });
    }
    res.json({ success: true });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Identity review failed.' });
  }
});

router.post('/:userId/application/:action', async (req: AdminRequest, res) => {
  const action = req.params.action;
  const reviewerNote = String(req.body.reviewerNote ?? '').trim();
  if (!['approve', 'reject'].includes(action))
    return res.status(404).json({ error: 'Unknown review action.' });
  if (action === 'reject' && reviewerNote.length < 5) {
    return res.status(400).json({ error: 'A rejection reason is required.' });
  }
  try {
    if (req.admin!.userId === req.params.userId) {
      return res
        .status(403)
        .json({ error: 'Administrators cannot decide their own cook application.' });
    }
    const { data: application, error } = await supabase
      .from('cook_applications')
      .select('user_id, identity_status, compliance_status')
      .eq('user_id', req.params.userId)
      .maybeSingle();
    if (error) throw error;
    if (!application) return res.status(404).json({ error: 'Cook application not found.' });
    if (action === 'approve' && application.identity_status !== 'approved') {
      return res.status(409).json({ error: 'Identity review must be approved first.' });
    }
    const now = new Date().toISOString();
    const approved = action === 'approve';
    const { error: updateError } = await supabase
      .from('cook_applications')
      .update({
        status: approved ? 'approved' : 'rejected',
        compliance_status: application.compliance_status,
        approved_at: approved ? now : null,
        approved_by: approved ? req.admin!.userId : null,
        rejected_at: approved ? null : now,
        rejected_by: approved ? null : req.admin!.userId,
        reviewer_note: reviewerNote || null,
        reverification_due_at: null,
        updated_at: now,
      })
      .eq('user_id', req.params.userId);
    if (updateError) throw updateError;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({ updated_at: now })
      .eq('user_id', req.params.userId)
      .select('id')
      .single();
    if (profileError) throw profileError;
    let listingUpdate = supabase
      .from('listings')
      .update({ is_active: approved })
      .eq('cook_id', profile.id);
    if (approved) listingUpdate = listingUpdate.in('status', ['approved', 'pending']);
    const { error: listingsError } = await listingUpdate;
    if (listingsError) throw listingsError;
    await supabase.from('notifications').insert({
      user_id: req.params.userId,
      recipient_role: 'cook',
      type: approved ? 'verification_approved' : 'verification_rejected',
      title: approved ? 'Cook application approved' : 'Cook application rejected',
      body: approved
        ? 'You can now submit dishes for publication and accept orders once each dish is approved.'
        : reviewerNote,
      data: { application_status: approved ? 'approved' : 'rejected' },
    });
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: req.params.userId,
      action: approved ? 'cook_application_approved' : 'cook_application_rejected',
      details: { reviewerNote: reviewerNote || null },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Application review failed.' });
  }
});

router.post('/:userId/hide-listings', async (req: AdminRequest, res) => {
  if (req.admin!.userId === req.params.userId) {
    return res
      .status(403)
      .json({ error: 'Administrators cannot restrict their own cook account.' });
  }
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', req.params.userId)
      .maybeSingle();
    if (error || !profile) return res.status(404).json({ error: 'Cook not found.' });
    const { error: updateError } = await supabase
      .from('listings')
      .update({ is_active: false })
      .eq('cook_id', profile.id);
    if (updateError) throw updateError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: req.params.userId,
      action: 'cook_listings_hidden',
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Listings could not be hidden.' });
  }
});

export default router;
