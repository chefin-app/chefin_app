import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { normalizeExpiredSuspension } from '../accountAccess';
import { supabase } from '../supabaseClient';

export interface AdminIdentity {
  userId: string;
  email: string | null;
  fullName: string;
  profileImage: string | null;
}

export type AdminRequest = Request & { admin?: AdminIdentity };

const getBearerToken = (req: Request): string | null => {
  const authorization = req.header('authorization')?.trim() ?? '';
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
};

/**
 * Validates the Supabase access token and then checks the role server-side.
 * Every admin API using the service-role client must use this middleware.
 */
export const requireAdmin: RequestHandler = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Admin sign-in required.' });
    return;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      res.status(401).json({ error: 'Your admin session has expired.' });
      return;
    }

    const { data: role, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) {
      res.status(403).json({ error: 'This account does not have administrator access.' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'id, user_id, full_name, profile_image, account_status, suspension_reason, suspension_ends_at, restricted_listing_ids'
      )
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    if (profile) {
      const account = await normalizeExpiredSuspension(profile);
      if (account.status !== 'active') {
        res.status(403).json({
          error:
            account.status === 'suspended'
              ? 'This administrator account is suspended.'
              : 'This administrator account is deactivated.',
        });
        return;
      }
    }

    req.admin = {
      userId: authData.user.id,
      email: authData.user.email ?? null,
      fullName:
        profile?.full_name?.trim() ||
        (typeof authData.user.user_metadata?.full_name === 'string'
          ? authData.user.user_metadata.full_name
          : '') ||
        'Chefin Admin',
      profileImage: profile?.profile_image ?? null,
    };
    next();
  } catch (error: unknown) {
    console.error('Admin authorization failed:', error);
    res.status(503).json({ error: 'Admin access could not be verified right now.' });
  }
};
