import express from 'express';
import type { AdminRequest } from '../middleware/requireAdmin';
import { writeAdminAudit } from '../adminAudit';
import { supabase } from '../supabaseClient';

const router = express.Router();
const STATUSES = ['pending', 'reviewing', 'actioned', 'dismissed'] as const;

router.get('/', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const search = String(req.query.search ?? '').trim();
  try {
    let query = supabase
      .from('content_reports')
      .select(
        'id, reporter_id, target_type, target_id, target_label, target_snapshot, reason, details, status, created_at, updated_at, reviewed_by, resolved_at, resolution_note, profiles(full_name, profile_image, user_id)'
      )
      .order('created_at', { ascending: false })
      .limit(250);
    if (status === 'open') query = query.in('status', ['pending', 'reviewing']);
    else if (STATUSES.includes(status as (typeof STATUSES)[number]))
      query = query.eq('status', status);
    if (search) query = query.ilike('target_label', `%${search}%`);
    const [{ data, error }, countsResult] = await Promise.all([
      query,
      supabase.from('content_reports').select('status'),
    ]);
    if (error || countsResult.error) throw error ?? countsResult.error;
    const counts = (countsResult.data ?? []).reduce<Record<string, number>>((result, row) => {
      result[row.status] = (result[row.status] ?? 0) + 1;
      return result;
    }, {});
    res.json({ reports: data ?? [], counts });
  } catch (error: unknown) {
    console.error('Could not load moderation queue:', error);
    res.status(500).json({ error: 'Moderation queue could not be loaded.' });
  }
});

router.patch('/:reportId', async (req: AdminRequest, res) => {
  const { reportId } = req.params;
  const status = String(req.body.status ?? '');
  const resolutionNote = String(req.body.resolutionNote ?? '').trim();
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return res.status(400).json({ error: 'Invalid moderation status.' });
  }
  if (['actioned', 'dismissed'].includes(status) && resolutionNote.length < 5) {
    return res.status(400).json({ error: 'A resolution note is required when closing a report.' });
  }
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('content_reports')
      .update({
        status,
        reviewed_by: req.admin!.userId,
        resolution_note: resolutionNote || null,
        resolved_at: ['actioned', 'dismissed'].includes(status) ? now : null,
        updated_at: now,
      })
      .eq('id', reportId)
      .select('id, reporter_id, target_type, target_id, target_label, status')
      .single();
    if (error || !data) throw error ?? new Error('Report not found.');
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      action: 'report_status_updated',
      details: {
        reportId,
        status,
        targetType: data.target_type,
        targetId: data.target_id,
        resolutionNote,
      },
    });
    res.json({ success: true, report: data });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Report update failed.' });
  }
});

export default router;
