import { supabase } from './supabaseClient';

export async function writeAdminAudit(input: {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabase.from('admin_audit_logs').insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    details: input.details ?? {},
  });
  if (error) throw error;
}
