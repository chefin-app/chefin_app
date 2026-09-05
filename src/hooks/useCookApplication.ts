import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/src/services/auth-context';

export type CookApplicationAccess = {
  loading: boolean;
  status: string | null;
  identityStatus: string | null;
  complianceStatus: string | null;
  citizenshipType: string | null;
  submittedAt: string | null;
  reviewerNote: string | null;
  reverificationDueAt: string | null;
  eligibleToSell: boolean;
  restrictedToDrafts: boolean;
  refresh: () => Promise<void>;
};

export function useCookApplication(): CookApplicationAccess {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Omit<CookApplicationAccess, 'loading' | 'refresh'>>({
    status: null,
    identityStatus: null,
    complianceStatus: null,
    citizenshipType: null,
    submittedAt: null,
    reviewerNote: null,
    reverificationDueAt: null,
    eligibleToSell: false,
    restrictedToDrafts: true,
  });

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/cook-applications/status`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        application?: {
          status?: string;
          identity_status?: string;
          compliance_status?: string;
          citizenship_type?: string;
          submitted_at?: string;
          reviewer_note?: string | null;
          reverification_due_at?: string | null;
        } | null;
        eligibility?: { eligibleToSell?: boolean; restrictedToDrafts?: boolean };
      };
      if (!response.ok) throw new Error('Cook application status could not be loaded.');
      setState({
        status: payload.application?.status ?? null,
        identityStatus: payload.application?.identity_status ?? null,
        complianceStatus: payload.application?.compliance_status ?? null,
        citizenshipType: payload.application?.citizenship_type ?? null,
        submittedAt: payload.application?.submitted_at ?? null,
        reviewerNote: payload.application?.reviewer_note ?? null,
        reverificationDueAt: payload.application?.reverification_due_at ?? null,
        eligibleToSell: payload.eligibility?.eligibleToSell === true,
        restrictedToDrafts: payload.eligibility?.restrictedToDrafts !== false,
      });
    } catch (error) {
      console.warn('Could not load cook application access', error);
      setState(current => ({ ...current, eligibleToSell: false, restrictedToDrafts: true }));
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, ...state, refresh };
}
