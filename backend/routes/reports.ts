import express from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../supabaseClient';
import {
  isReportTargetType,
  isUuid,
  validateReportPayload,
  type ReportTargetType,
} from '../reporting';

const router = express.Router();

type Reporter = {
  authUserId: string;
  profileId: string;
};

type ReportTarget = {
  label: string;
  ownerUserId: string;
  snapshot: Record<string, unknown>;
};

type AuthResult = { ok: true; reporter: Reporter } | { ok: false; status: number; error: string };

const authenticateReporter = async (req: Request): Promise<AuthResult> => {
  const authorization = req.header('authorization')?.trim() ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return { ok: false, status: 401, error: 'Sign in to submit a report.' };
  }

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) {
    return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return { ok: false, status: 403, error: 'Complete your profile before submitting a report.' };
  }

  return {
    ok: true,
    reporter: { authUserId: data.user.id, profileId: profile.id },
  };
};

const resolveTarget = async (
  targetType: ReportTargetType,
  targetId: string
): Promise<ReportTarget | null> => {
  if (targetType === 'listing') {
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, title, description, price, image_url, cuisine, cook_id')
      .eq('id', targetId)
      .eq('status', 'approved')
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!listing) return null;

    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', listing.cook_id)
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (!owner) return null;

    return {
      label: Array.from(listing.title).slice(0, 200).join(''),
      ownerUserId: owner.user_id,
      snapshot: {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        image_url: listing.image_url,
        cuisine: listing.cuisine,
        cook_profile_id: listing.cook_id,
      },
    };
  }

  const { data: restaurant, error } = await supabase
    .from('profiles')
    .select('id, user_id, restaurant_name, full_name, profile_image, bio')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw error;
  if (!restaurant) return null;

  // A regular customer profile is not a reportable home restaurant.
  const { count, error: listingError } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('cook_id', targetId)
    .eq('status', 'approved')
    .eq('is_active', true);
  if (listingError) throw listingError;
  if (!count) return null;

  const label = restaurant.restaurant_name?.trim() || restaurant.full_name?.trim();
  return label
    ? {
        label: Array.from(label).slice(0, 200).join(''),
        ownerUserId: restaurant.user_id,
        snapshot: {
          restaurant_name: restaurant.restaurant_name,
          cook_name: restaurant.full_name,
          profile_image: restaurant.profile_image,
          bio: restaurant.bio,
        },
      }
    : null;
};

const sendAuthError = (res: Response, auth: Extract<AuthResult, { ok: false }>) =>
  res.status(auth.status).json({ error: auth.error });

// Check whether the signed-in user has already reported this target. This
// powers the form's already-submitted state; the database unique constraint is
// still the final protection against simultaneous double submissions.
router.get('/status/:targetType/:targetId', async (req, res) => {
  const { targetType, targetId } = req.params;
  if (!isReportTargetType(targetType) || !isUuid(targetId)) {
    return res.status(400).json({ error: 'Invalid report target.' });
  }

  try {
    const auth = await authenticateReporter(req);
    if (!auth.ok) return sendAuthError(res, auth);

    const { data, error } = await supabase
      .from('content_reports')
      .select('id, status, created_at')
      .eq('reporter_id', auth.reporter.profileId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .in('status', ['pending', 'reviewing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return res.json({ reported: Boolean(data), report: data ?? null });
  } catch (error: unknown) {
    console.error('Error checking report status:', error);
    return res.status(500).json({ error: 'Could not check this report right now.' });
  }
});

// Submit a listing or restaurant report. The reporter identity comes only from
// the bearer token; client-supplied user ids are deliberately ignored.
router.post('/', async (req, res) => {
  const validation = validateReportPayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const auth = await authenticateReporter(req);
    if (!auth.ok) return sendAuthError(res, auth);
    const targetNoun = validation.value.targetType === 'restaurant' ? 'restaurant' : 'listing';

    const target = await resolveTarget(validation.value.targetType, validation.value.targetId);
    if (!target) {
      return res.status(404).json({ error: `This ${targetNoun} is no longer available.` });
    }
    if (target.ownerUserId === auth.reporter.authUserId) {
      return res.status(403).json({ error: `You cannot report your own ${targetNoun}.` });
    }

    const { data: existing, error: existingError } = await supabase
      .from('content_reports')
      .select('id, status, created_at')
      .eq('reporter_id', auth.reporter.profileId)
      .eq('target_type', validation.value.targetType)
      .eq('target_id', validation.value.targetId)
      .in('status', ['pending', 'reviewing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return res.status(409).json({
        error: `You have already reported this ${targetNoun}.`,
        code: 'DUPLICATE_REPORT',
        report: existing,
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentReportCount, error: rateLimitError } = await supabase
      .from('content_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', auth.reporter.profileId)
      .gte('created_at', oneHourAgo);
    if (rateLimitError) throw rateLimitError;
    if ((recentReportCount ?? 0) >= 10) {
      return res.status(429).json({
        error: 'You have submitted several reports recently. Please try again later.',
      });
    }

    const { data: report, error: insertError } = await supabase
      .from('content_reports')
      .insert({
        reporter_id: auth.reporter.profileId,
        target_type: validation.value.targetType,
        target_id: validation.value.targetId,
        target_label: target.label,
        target_snapshot: target.snapshot,
        reason: validation.value.reason,
        details: validation.value.details,
      })
      .select('id, status, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({
          error: `You have already reported this ${targetNoun}.`,
          code: 'DUPLICATE_REPORT',
        });
      }
      throw insertError;
    }

    return res.status(201).json({ success: true, report });
  } catch (error: unknown) {
    console.error('Error submitting content report:', error);
    return res.status(500).json({ error: 'We could not submit your report. Please try again.' });
  }
});

export default router;
