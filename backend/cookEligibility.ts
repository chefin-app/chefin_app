import { supabase } from './supabaseClient';

export type CookApplicationStatus =
  | 'draft'
  | 'pending'
  | 'reverification_required'
  | 'approved'
  | 'rejected';

export type CookEligibility = {
  eligibleToSell: boolean;
  restrictedToDrafts: boolean;
  status: CookApplicationStatus | 'not_started';
  reverificationDueAt: string | null;
};

export const evaluateCookEligibility = (
  application: {
    status?: string | null;
    reverification_due_at?: string | null;
  } | null
): CookEligibility => {
  const status = (application?.status ?? 'not_started') as CookEligibility['status'];
  const reverificationDueAt = application?.reverification_due_at ?? null;
  const grandfathered =
    status === 'reverification_required' &&
    Boolean(reverificationDueAt) &&
    new Date(reverificationDueAt!).getTime() > Date.now();
  const eligibleToSell = status === 'approved' || grandfathered;
  return { eligibleToSell, restrictedToDrafts: !eligibleToSell, status, reverificationDueAt };
};

export async function getCookEligibilityByUserId(userId: string): Promise<CookEligibility> {
  const { data, error } = await supabase
    .from('cook_applications')
    .select('status, reverification_due_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return evaluateCookEligibility(data);
}

export async function getCookEligibilityByProfileId(profileId: string): Promise<CookEligibility> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return evaluateCookEligibility(null);
  return getCookEligibilityByUserId(profile.user_id);
}

/**
 * Cooks who have actively paused their store. Paused stores stay out of
 * buyer-side discovery feeds, but remain reachable via direct links and
 * favourites (the restaurant page shows a paused notice instead).
 */
export async function getPausedCookProfileIds(profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, store_status, store_paused_until')
    .in('id', [...new Set(profileIds)])
    .eq('store_status', 'paused');
  if (error) throw error;
  const now = Date.now();
  return new Set(
    (data ?? [])
      .filter(
        profile =>
          profile.store_paused_until && new Date(profile.store_paused_until).getTime() > now
      )
      .map(profile => profile.id)
  );
}

export async function getEligibleCookUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('cook_applications')
    .select('user_id, status, reverification_due_at')
    .in('user_id', [...new Set(userIds)]);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter(application => evaluateCookEligibility(application).eligibleToSell)
      .map(application => application.user_id)
  );
}
