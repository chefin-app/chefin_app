import { FOOD_SAFETY_WAIVER_VERSION } from '@/src/constants/foodSafetyWaiver';
import { supabase } from '@/src/utils/supabaseClient';

export type FoodComplianceAcceptanceSource =
  | 'food_safety_screen'
  | 'cook_onboarding'
  | 'start_restaurant';

export interface FoodComplianceAcceptance {
  acceptedAt: string;
  clauseVersion: string;
}

/** Returns the cook's immutable acceptance for the currently displayed clause. */
export async function getCurrentFoodComplianceAcceptance(
  userId: string
): Promise<FoodComplianceAcceptance | null> {
  const { data, error } = await supabase
    .from('cook_compliance_acceptances')
    .select('accepted_at, clause_version')
    .eq('user_id', userId)
    .eq('clause_version', FOOD_SAFETY_WAIVER_VERSION)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    acceptedAt: data.accepted_at as string,
    clauseVersion: data.clause_version as string,
  };
}

/**
 * Records acceptance once per cook and clause version. The clause text itself
 * lives in a protected version table so the client cannot alter the accepted
 * wording. A duplicate insert is success because acceptances are immutable.
 */
export async function recordFoodComplianceAcceptance(
  userId: string,
  source: FoodComplianceAcceptanceSource
): Promise<void> {
  const { error } = await supabase.from('cook_compliance_acceptances').insert({
    user_id: userId,
    clause_version: FOOD_SAFETY_WAIVER_VERSION,
    source,
  });

  if (error && error.code !== '23505') throw error;
}
