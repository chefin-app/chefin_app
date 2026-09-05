import express from 'express';
import type { User } from '@supabase/supabase-js';
import type { AdminRequest } from '../middleware/requireAdmin';
import { normalizeExpiredSuspension, restoreRestrictedListings } from '../accountAccess';
import { writeAdminAudit } from '../adminAudit';
import { getAdminDateBounds } from '../adminDateFilter';
import { sendAdminEmail } from '../email';
import { supabase } from '../supabaseClient';

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_FILTERS = new Set([
  'all',
  'cooks',
  'customers',
  'admins',
  'pending_verification',
  'flagged',
  'suspended',
  'deactivated',
]);
const USER_SORTS = new Set(['newest', 'oldest', 'name_asc', 'name_desc', 'last_active']);

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  profile_image: string | null;
  phone_number: string | null;
  restaurant_name: string | null;
  is_verified: boolean | null;
  verification_tier: number | null;
  created_at: string | null;
  updated_at: string | null;
  account_status: string | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  suspension_ends_at: string | null;
  suspended_by: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  deactivated_by: string | null;
  restricted_listing_ids: string[] | null;
};

type UserListRow = {
  userId: string;
  profileId: string | null;
  displayId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  roles: string[];
  primaryRole: 'Admin' | 'Cook' | 'Customer';
  verified: boolean | null;
  joinedAt: string;
  lastSignInAt: string | null;
  status: 'active' | 'suspended' | 'deactivated';
  suspensionEndsAt: string | null;
  reportCount: number;
  reportsSubmitted: number;
  pendingVerification: boolean;
};

const compactId = (id: string): string => id.split('-')[0].toUpperCase();

async function listAllAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return users;
}

async function getAdminCount(): Promise<number> {
  const { count, error } = await supabase
    .from('user_roles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) throw error;
  return count ?? 0;
}

async function getRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => row.role);
}

const primaryRole = (roles: string[]): UserListRow['primaryRole'] =>
  roles.includes('admin') ? 'Admin' : roles.includes('cook') ? 'Cook' : 'Customer';

const requireOtherUser = (req: AdminRequest, res: express.Response, targetUserId: string) => {
  if (req.admin?.userId === targetUserId) {
    res.status(403).json({ error: 'Administrators cannot modify their own account here.' });
    return false;
  }
  return true;
};

async function ensureAdminRemains(targetUserId: string) {
  const roles = await getRoles(targetUserId);
  if (roles.includes('admin') && (await getAdminCount()) <= 1) {
    throw new Error('The final administrator account cannot be restricted or demoted.');
  }
}

async function loadProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, user_id, full_name, profile_image, phone_number, restaurant_name, is_verified, verification_tier, created_at, updated_at, account_status, suspension_reason, suspended_at, suspension_ends_at, suspended_by, deactivated_at, deactivation_reason, deactivated_by, restricted_listing_ids'
    )
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('User profile not found.');
  return data as ProfileRow;
}

async function restrictListings(profile: ProfileRow): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id')
    .eq('cook_id', profile.id)
    .eq('is_active', true);
  if (error) throw error;
  const ids = [
    ...new Set([...(profile.restricted_listing_ids ?? []), ...(data ?? []).map(row => row.id)]),
  ];
  if (ids.length > 0) {
    const { error: hideError } = await supabase
      .from('listings')
      .update({ is_active: false })
      .in('id', ids);
    if (hideError) throw hideError;
  }
  return ids;
}

async function createAccountNotice(
  targetUserId: string,
  roles: string[],
  title: string,
  body: string
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: targetUserId,
    recipient_role: roles.includes('cook') ? 'cook' : 'customer',
    type: 'admin_message',
    title,
    body,
    data: { source: 'admin' },
  });
  if (error) throw error;
}

router.get('/', async (req, res) => {
  try {
    const filter = USER_FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : 'all';
    const sort = USER_SORTS.has(String(req.query.sort)) ? String(req.query.sort) : 'newest';
    const search = String(req.query.search ?? '')
      .trim()
      .toLowerCase();
    const dateRange = String(req.query.dateRange ?? 'all');
    const exactDateBounds = getAdminDateBounds(req.query.date);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(10, Number(req.query.pageSize) || 25));

    const [authUsers, profilesResult, rolesResult, reportsResult, listingsResult, docsResult] =
      await Promise.all([
        listAllAuthUsers(),
        supabase
          .from('profiles')
          .select(
            'id, user_id, full_name, profile_image, phone_number, restaurant_name, is_verified, verification_tier, created_at, updated_at, account_status, suspension_reason, suspended_at, suspension_ends_at, suspended_by, deactivated_at, deactivation_reason, deactivated_by, restricted_listing_ids'
          ),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('content_reports').select('reporter_id, target_type, target_id, status'),
        supabase.from('listings').select('id, cook_id'),
        supabase.from('verification_documents').select('user_id, status').eq('status', 'pending'),
      ]);

    const firstError = [
      profilesResult.error,
      rolesResult.error,
      reportsResult.error,
      listingsResult.error,
      docsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const profileByUserId = new Map(profiles.map(profile => [profile.user_id, profile]));
    const rolesByUserId = new Map<string, string[]>();
    for (const role of rolesResult.data ?? []) {
      rolesByUserId.set(role.user_id, [...(rolesByUserId.get(role.user_id) ?? []), role.role]);
    }
    const listingOwnerById = new Map(
      (listingsResult.data ?? []).map(listing => [listing.id, listing.cook_id])
    );
    const pendingVerificationIds = new Set((docsResult.data ?? []).map(doc => doc.user_id));
    const reportsAgainst = new Map<string, number>();
    const reportsSubmitted = new Map<string, number>();
    for (const report of reportsResult.data ?? []) {
      reportsSubmitted.set(report.reporter_id, (reportsSubmitted.get(report.reporter_id) ?? 0) + 1);
      const targetProfileId =
        report.target_type === 'restaurant'
          ? report.target_id
          : listingOwnerById.get(report.target_id);
      if (targetProfileId && ['pending', 'reviewing'].includes(report.status)) {
        reportsAgainst.set(targetProfileId, (reportsAgainst.get(targetProfileId) ?? 0) + 1);
      }
    }

    const expiredProfiles = profiles.filter(
      profile =>
        profile.account_status === 'suspended' &&
        profile.suspension_ends_at &&
        new Date(profile.suspension_ends_at).getTime() <= Date.now()
    );
    await Promise.all(expiredProfiles.map(profile => normalizeExpiredSuspension(profile)));
    const expiredIds = new Set(expiredProfiles.map(profile => profile.user_id));

    let rows: UserListRow[] = authUsers.map(authUser => {
      const profile = profileByUserId.get(authUser.id);
      const roles = rolesByUserId.get(authUser.id) ?? [];
      const status = expiredIds.has(authUser.id)
        ? 'active'
        : ((profile?.account_status ?? 'active') as UserListRow['status']);
      return {
        userId: authUser.id,
        profileId: profile?.id ?? null,
        displayId: compactId(authUser.id),
        name:
          profile?.full_name?.trim() ||
          (typeof authUser.user_metadata?.full_name === 'string'
            ? authUser.user_metadata.full_name
            : '') ||
          'Invited user',
        email: authUser.email ?? 'No email',
        phone: profile?.phone_number ?? authUser.phone ?? null,
        avatarUrl: profile?.profile_image ?? null,
        roles,
        primaryRole: primaryRole(roles),
        verified: roles.includes('cook') ? Boolean(profile?.is_verified) : null,
        joinedAt: profile?.created_at ?? authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        status,
        suspensionEndsAt: status === 'suspended' ? (profile?.suspension_ends_at ?? null) : null,
        reportCount: profile ? (reportsAgainst.get(profile.id) ?? 0) : 0,
        reportsSubmitted: profile ? (reportsSubmitted.get(profile.id) ?? 0) : 0,
        pendingVerification: pendingVerificationIds.has(authUser.id),
      };
    });

    const cutoffDays =
      dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 0;
    if (exactDateBounds) {
      rows = rows.filter(row => {
        const joinedAt = new Date(row.joinedAt).getTime();
        return joinedAt >= exactDateBounds.start && joinedAt < exactDateBounds.end;
      });
    } else if (cutoffDays > 0) {
      const cutoff = Date.now() - cutoffDays * 86400000;
      rows = rows.filter(row => new Date(row.joinedAt).getTime() >= cutoff);
    }
    if (search) {
      rows = rows.filter(row =>
        [row.displayId, row.userId, row.name, row.email, row.phone ?? ''].some(value =>
          value.toLowerCase().includes(search)
        )
      );
    }
    rows = rows.filter(row => {
      if (filter === 'cooks') return row.roles.includes('cook');
      if (filter === 'customers') return row.primaryRole === 'Customer';
      if (filter === 'admins') return row.roles.includes('admin');
      if (filter === 'pending_verification') return row.pendingVerification;
      if (filter === 'flagged') return row.reportCount > 0 || row.status !== 'active';
      if (filter === 'suspended') return row.status === 'suspended';
      if (filter === 'deactivated') return row.status === 'deactivated';
      return true;
    });
    rows.sort((a, b) => {
      if (sort === 'oldest') return +new Date(a.joinedAt) - +new Date(b.joinedAt);
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'last_active')
        return +new Date(b.lastSignInAt ?? 0) - +new Date(a.lastSignInAt ?? 0);
      return +new Date(b.joinedAt) - +new Date(a.joinedAt);
    });

    const allRows = authUsers.map(authUser => {
      const profile = profileByUserId.get(authUser.id);
      const roles = rolesByUserId.get(authUser.id) ?? [];
      return {
        roles,
        status: expiredIds.has(authUser.id)
          ? 'active'
          : ((profile?.account_status ?? 'active') as UserListRow['status']),
        profileId: profile?.id,
      };
    });
    const flaggedProfiles = new Set(reportsAgainst.keys());
    const total = rows.length;
    const start = (page - 1) * pageSize;
    res.json({
      stats: {
        totalUsers: authUsers.length,
        activeCooks: allRows.filter(row => row.status === 'active' && row.roles.includes('cook'))
          .length,
        activeCustomers: allRows.filter(
          row =>
            row.status === 'active' && !row.roles.includes('cook') && !row.roles.includes('admin')
        ).length,
        flagged: allRows.filter(
          row =>
            row.status !== 'active' || Boolean(row.profileId && flaggedProfiles.has(row.profileId))
        ).length,
        pendingVerification: pendingVerificationIds.size,
      },
      users: rows.slice(start, start + pageSize),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error: unknown) {
    console.error('Could not list admin users:', error);
    res.status(500).json({ error: 'User management data could not be loaded.' });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [{ data: authData, error: authError }, profile, roles] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      loadProfile(userId),
      getRoles(userId),
    ]);
    if (authError || !authData.user) return res.status(404).json({ error: 'User not found.' });

    const [
      ordersResult,
      reviewsResult,
      submittedResult,
      listingsResult,
      documentsResult,
      auditResult,
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id, total_price, payment_status, status')
        .eq('customer_id', profile.id),
      supabase.from('reviews').select('id').eq('customer_id', profile.id),
      supabase
        .from('content_reports')
        .select('id, target_type, target_label, reason, status, created_at')
        .eq('reporter_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('listings').select('id, title').eq('cook_id', profile.id),
      supabase
        .from('verification_documents')
        .select('id, doc_type, status, reviewer_note, submitted_at, reviewed_at')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('admin_audit_logs')
        .select('id, actor_user_id, action, details, created_at')
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    const firstError = [
      ordersResult.error,
      reviewsResult.error,
      submittedResult.error,
      listingsResult.error,
      documentsResult.error,
      auditResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const listingIds = (listingsResult.data ?? []).map(listing => listing.id);
    const againstQueries = [
      supabase
        .from('content_reports')
        .select('id, target_type, target_label, reason, details, status, created_at')
        .eq('target_type', 'restaurant')
        .eq('target_id', profile.id),
    ];
    if (listingIds.length > 0) {
      againstQueries.push(
        supabase
          .from('content_reports')
          .select('id, target_type, target_label, reason, details, status, created_at')
          .eq('target_type', 'listing')
          .in('target_id', listingIds)
      );
    }
    const againstResults = await Promise.all(againstQueries);
    const againstError = againstResults.map(result => result.error).find(Boolean);
    if (againstError) throw againstError;
    const allReportsAgainst = againstResults
      .flatMap(result => result.data ?? [])
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const reportsAgainst = allReportsAgainst.slice(0, 8);

    const paidOrders = (ordersResult.data ?? []).filter(
      order => order.payment_status === 'paid' && order.status !== 'cancelled'
    );
    res.json({
      user: {
        userId,
        profileId: profile.id,
        displayId: compactId(userId),
        name: profile.full_name,
        email: authData.user.email ?? '',
        phone: profile.phone_number,
        avatarUrl: profile.profile_image,
        restaurantName: profile.restaurant_name,
        roles,
        primaryRole: primaryRole(roles),
        verified: roles.includes('cook') ? Boolean(profile.is_verified) : null,
        verificationTier: profile.verification_tier ?? 0,
        joinedAt: profile.created_at ?? authData.user.created_at,
        lastSignInAt: authData.user.last_sign_in_at ?? null,
        updatedAt: profile.updated_at,
        status: profile.account_status ?? 'active',
        reportCount: allReportsAgainst.length,
        reportsSubmitted: submittedResult.data?.length ?? 0,
        pendingVerification: (documentsResult.data ?? []).some(doc => doc.status === 'pending'),
        suspensionReason: profile.suspension_reason,
        suspendedAt: profile.suspended_at,
        suspensionEndsAt: profile.suspension_ends_at,
        deactivatedAt: profile.deactivated_at,
        deactivationReason: profile.deactivation_reason,
      },
      summary: {
        ordersPlaced: ordersResult.data?.length ?? 0,
        recordedSpend: paidOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0),
        reviewsSubmitted: reviewsResult.data?.length ?? 0,
        reportsSubmitted: submittedResult.data?.length ?? 0,
        reportsAgainst: allReportsAgainst.length,
      },
      reportsSubmitted: (submittedResult.data ?? []).slice(0, 8),
      reportsAgainst,
      verificationDocuments: documentsResult.data ?? [],
      activity: [
        {
          id: `joined-${userId}`,
          action: 'account_created',
          created_at: profile.created_at ?? authData.user.created_at,
          details: {},
        },
        ...(authData.user.last_sign_in_at
          ? [
              {
                id: `signin-${userId}`,
                action: 'last_sign_in',
                created_at: authData.user.last_sign_in_at,
                details: {},
              },
            ]
          : []),
        ...(auditResult.data ?? []),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    });
  } catch (error: unknown) {
    console.error('Could not load user details:', error);
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'User details failed.' });
  }
});

router.post('/invite', async (req: AdminRequest, res) => {
  const email = String(req.body.email ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(req.body.fullName ?? '').trim();
  const role = String(req.body.role ?? 'customer').toLowerCase();
  if (!EMAIL_PATTERN.test(email) || fullName.length < 2) {
    return res.status(400).json({ error: 'A valid email and full name are required.' });
  }
  if (!['customer', 'cook', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid account role.' });
  }

  try {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, invited_role: role },
      redirectTo: process.env.ADMIN_INVITE_REDIRECT_URL,
    });
    if (error || !data.user) throw error ?? new Error('Invitation could not be created.');
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        user_id: data.user.id,
        full_name: fullName,
        onboarding_completed: false,
        account_status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (profileError) throw profileError;
    const assignedRoles = ['guest', ...(role === 'customer' ? [] : [role])];
    const { error: roleError } = await supabase.from('user_roles').upsert(
      assignedRoles.map(assignedRole => ({ user_id: data.user!.id, role: assignedRole })),
      { onConflict: 'user_id,role' }
    );
    if (roleError) throw roleError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: data.user.id,
      action: 'user_invited',
      details: { email, role },
    });
    res.status(201).json({ success: true, userId: data.user.id });
  } catch (error: unknown) {
    console.error('Could not invite user:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invitation failed.' });
  }
});

router.patch('/:userId', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  const fullName = String(req.body.fullName ?? '').trim();
  const email = String(req.body.email ?? '')
    .trim()
    .toLowerCase();
  const phone = String(req.body.phone ?? '').trim();
  const restaurantName = String(req.body.restaurantName ?? '').trim();
  const role = String(req.body.role ?? '').toLowerCase();
  if (
    fullName.length < 2 ||
    !EMAIL_PATTERN.test(email) ||
    !['customer', 'cook', 'admin'].includes(role)
  ) {
    return res.status(400).json({ error: 'Name, email and role are required.' });
  }
  try {
    const currentRoles = await getRoles(userId);
    if (currentRoles.includes('admin') && role !== 'admin') await ensureAdminRemains(userId);
    const { error: authError } = await supabase.auth.admin.updateUserById(userId, { email });
    if (authError) throw authError;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone_number: phone || null,
        restaurant_name: restaurantName || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (profileError) throw profileError;
    // Administrator access is supplemental. Promoting an existing cook must
    // not remove their cook dashboard access or customer-mode role.
    const desiredRoles = [
      'guest',
      ...(role === 'cook' ? ['cook'] : []),
      ...(role === 'admin' ? ['admin'] : []),
      ...(req.body.preserveAdminRole === true && currentRoles.includes('admin') ? ['admin'] : []),
      ...(role === 'admin' && currentRoles.includes('cook') ? ['cook'] : []),
    ];
    const uniqueDesiredRoles = [...new Set(desiredRoles)];
    const { error: deleteRoleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .not('role', 'in', `(${uniqueDesiredRoles.join(',')})`);
    if (deleteRoleError) throw deleteRoleError;
    const { error: roleError } = await supabase.from('user_roles').upsert(
      uniqueDesiredRoles.map(desiredRole => ({ user_id: userId, role: desiredRole })),
      { onConflict: 'user_id,role' }
    );
    if (roleError) throw roleError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'user_profile_updated',
      details: { role, assignedRoles: uniqueDesiredRoles, emailChanged: true },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Could not update user:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Update failed.' });
  }
});

router.post('/:userId/suspend', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  const reason = String(req.body.reason ?? '').trim();
  const durationDays = req.body.durationDays == null ? null : Number(req.body.durationDays);
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Provide a suspension reason of 5–500 characters.' });
  }
  if (
    durationDays !== null &&
    (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)
  ) {
    return res.status(400).json({ error: 'Suspension duration must be 1–3650 days.' });
  }
  try {
    await ensureAdminRemains(userId);
    const profile = await loadProfile(userId);
    const roles = await getRoles(userId);
    const restrictedListingIds = await restrictListings(profile);
    const now = new Date();
    const endsAt = durationDays ? new Date(now.getTime() + durationDays * 86400000) : null;
    const { error } = await supabase
      .from('profiles')
      .update({
        account_status: 'suspended',
        suspension_reason: reason,
        suspended_at: now.toISOString(),
        suspension_ends_at: endsAt?.toISOString() ?? null,
        suspended_by: req.admin!.userId,
        restricted_listing_ids: restrictedListingIds,
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
    const endText = endsAt
      ? ` until ${endsAt.toLocaleDateString('en-MY', { dateStyle: 'medium' })}`
      : ' indefinitely';
    const message = `Your Chefin account has been suspended${endText}. You may sign in and view existing information, but account actions are disabled. Reason: ${reason}`;
    let notificationResult: { sent: boolean; error?: string } = { sent: true };
    try {
      await createAccountNotice(userId, roles, 'Account suspended', message);
    } catch (notificationError: unknown) {
      notificationResult = {
        sent: false,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : 'In-app notification delivery failed.',
      };
      console.error(
        'Account suspended, but the notification could not be created:',
        notificationError
      );
    }
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(userId);
    const emailResult = authUserError
      ? { sent: false, error: authUserError.message }
      : authUser.user?.email
        ? await sendAdminEmail({
            to: authUser.user.email,
            subject: 'Your Chefin account is suspended',
            message,
          })
        : { sent: false, error: 'No email address.' };
    let auditResult: { recorded: boolean; error?: string } = { recorded: true };
    try {
      await writeAdminAudit({
        actorUserId: req.admin!.userId,
        targetUserId: userId,
        action: 'user_suspended',
        details: {
          reason,
          durationDays,
          endsAt: endsAt?.toISOString() ?? null,
          notificationSent: notificationResult.sent,
          emailSent: emailResult.sent,
        },
      });
    } catch (auditError: unknown) {
      auditResult = {
        recorded: false,
        error: auditError instanceof Error ? auditError.message : 'Audit logging failed.',
      };
      console.error('Account suspended, but the audit entry could not be written:', auditError);
    }
    res.json({
      success: true,
      suspensionEndsAt: endsAt?.toISOString() ?? null,
      email: emailResult,
      notification: notificationResult,
      audit: auditResult,
    });
  } catch (error: unknown) {
    console.error('Could not suspend user:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Suspension failed.' });
  }
});

router.post('/:userId/reinstate', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  try {
    const profile = await loadProfile(userId);
    if (profile.account_status !== 'suspended') {
      return res.status(409).json({ error: 'This account is not suspended.' });
    }
    await restoreRestrictedListings(profile.id, profile.restricted_listing_ids ?? []);
    const { error } = await supabase
      .from('profiles')
      .update({
        account_status: 'active',
        suspension_reason: null,
        suspended_at: null,
        suspension_ends_at: null,
        suspended_by: null,
        restricted_listing_ids: [],
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
    const roles = await getRoles(userId);
    await createAccountNotice(
      userId,
      roles,
      'Account reinstated',
      'Your Chefin account has been reinstated and account actions are available again.'
    );
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'user_reinstated',
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Reinstatement failed.' });
  }
});

router.post('/:userId/deactivate', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  const reason = String(req.body.reason ?? '').trim();
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Provide a deactivation reason of 5–500 characters.' });
  }
  try {
    await ensureAdminRemains(userId);
    const profile = await loadProfile(userId);
    const restrictedListingIds = await restrictListings(profile);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({
        account_status: 'deactivated',
        deactivated_at: now,
        deactivation_reason: reason,
        deactivated_by: req.admin!.userId,
        restricted_listing_ids: restrictedListingIds,
        updated_at: now,
      })
      .eq('user_id', userId);
    if (error) throw error;
    const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    });
    if (banError) throw banError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'user_deactivated',
      details: { reason },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Could not deactivate user:', error);
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Deactivation failed.' });
  }
});

router.post('/:userId/reactivate', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  try {
    const profile = await loadProfile(userId);
    await restoreRestrictedListings(profile.id, profile.restricted_listing_ids ?? []);
    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
    if (authError) throw authError;
    const { error } = await supabase
      .from('profiles')
      .update({
        account_status: 'active',
        deactivated_at: null,
        deactivation_reason: null,
        deactivated_by: null,
        suspension_reason: null,
        suspended_at: null,
        suspension_ends_at: null,
        suspended_by: null,
        restricted_listing_ids: [],
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'user_reactivated',
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Reactivation failed.' });
  }
});

router.post('/:userId/reset-password', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  if (!requireOtherUser(req, res, userId)) return;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user?.email) throw error ?? new Error('This user has no email address.');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
      redirectTo: process.env.ADMIN_INVITE_REDIRECT_URL,
    });
    if (resetError) throw resetError;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'password_reset_sent',
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Reset email failed.' });
  }
});

router.post('/:userId/message', async (req: AdminRequest, res) => {
  const { userId } = req.params;
  const subject = String(req.body.subject ?? '').trim();
  const message = String(req.body.message ?? '').trim();
  if (subject.length < 3 || subject.length > 120 || message.length < 5 || message.length > 2000) {
    return res
      .status(400)
      .json({ error: 'Provide a subject and message within the allowed length.' });
  }
  try {
    const [{ data: authData, error: authError }, roles] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      getRoles(userId),
    ]);
    if (authError || !authData.user) throw authError ?? new Error('User not found.');
    await createAccountNotice(userId, roles, subject, message);
    const emailResult = authData.user.email
      ? await sendAdminEmail({ to: authData.user.email, subject, message })
      : { sent: false, error: 'This user has no email address.' };
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: userId,
      action: 'admin_message_sent',
      details: { subject, emailSent: emailResult.sent, emailError: emailResult.error ?? null },
    });
    res.json({ success: true, inAppSent: true, email: emailResult });
  } catch (error: unknown) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Message failed.' });
  }
});

export default router;
