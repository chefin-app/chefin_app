import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { supabase } from './supabaseClient';

export type AccountStatus = 'active' | 'suspended' | 'deactivated';

export interface AccountIdentity {
  userId: string;
  profileId: string;
  status: AccountStatus;
  suspensionReason: string | null;
  suspensionEndsAt: string | null;
}

export type AccountRequest = Request & { account?: AccountIdentity };

export const getBearerToken = (req: Request): string | null => {
  const authorization = req.header('authorization')?.trim() ?? '';
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
};

const hasActiveSuspension = (status: string, endsAt: string | null): boolean =>
  status === 'suspended' && (!endsAt || new Date(endsAt).getTime() > Date.now());

export async function restoreRestrictedListings(profileId: string, listingIds: string[]) {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from('listings')
    .update({ is_active: true })
    .eq('cook_id', profileId)
    .in('id', listingIds);
  if (error) throw error;
}

export async function normalizeExpiredSuspension(profile: {
  id: string;
  user_id: string;
  account_status: string | null;
  suspension_reason: string | null;
  suspension_ends_at: string | null;
  restricted_listing_ids: string[] | null;
}): Promise<AccountIdentity> {
  const status = (profile.account_status ?? 'active') as AccountStatus;
  const expired =
    status === 'suspended' &&
    Boolean(profile.suspension_ends_at) &&
    new Date(profile.suspension_ends_at!).getTime() <= Date.now();

  if (expired) {
    const listingIds = profile.restricted_listing_ids ?? [];
    await restoreRestrictedListings(profile.id, listingIds);
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
      .eq('id', profile.id);
    if (error) throw error;
    return {
      userId: profile.user_id,
      profileId: profile.id,
      status: 'active',
      suspensionReason: null,
      suspensionEndsAt: null,
    };
  }

  return {
    userId: profile.user_id,
    profileId: profile.id,
    status: hasActiveSuspension(status, profile.suspension_ends_at) ? 'suspended' : status,
    suspensionReason: profile.suspension_reason,
    suspensionEndsAt: profile.suspension_ends_at,
  };
}

export async function authenticateAccount(
  req: Request
): Promise<{ ok: true; account: AccountIdentity } | { ok: false; status: number; error: string }> {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Sign in required.' };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, user_id, account_status, suspension_reason, suspension_ends_at, restricted_listing_ids'
    )
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { ok: false, status: 403, error: 'Complete your profile first.' };

  return { ok: true, account: await normalizeExpiredSuspension(profile) };
}

const accountMiddleware = (allowSuspended: boolean): RequestHandler =>
  async function accountAccessMiddleware(req: AccountRequest, res: Response, next: NextFunction) {
    try {
      const result = await authenticateAccount(req);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      if (result.account.status === 'deactivated') {
        res.status(403).json({ error: 'This account has been deactivated.' });
        return;
      }
      if (!allowSuspended && result.account.status === 'suspended') {
        res.status(403).json({
          error: 'This account is suspended and currently has read-only access.',
          code: 'ACCOUNT_SUSPENDED',
          suspensionEndsAt: result.account.suspensionEndsAt,
        });
        return;
      }
      req.account = result.account;
      next();
    } catch (error: unknown) {
      console.error('Account access check failed:', error);
      res.status(503).json({ error: 'Account access could not be verified right now.' });
    }
  };

export const requireActiveAccount = accountMiddleware(false);
export const requireReadableAccount = accountMiddleware(true);
