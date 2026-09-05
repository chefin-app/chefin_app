export type DishManagementStatus = 'active' | 'inactive' | 'pending' | 'rejected';
export type DishManagementAction =
  | 'approve'
  | 'reject'
  | 'unpublish'
  | 'republish'
  | 'clear_rejection';

export interface DishStatusSnapshot {
  status: string;
  isActive: boolean;
}

export const deriveDishManagementStatus = ({
  status,
  isActive,
}: DishStatusSnapshot): DishManagementStatus => {
  if (status === 'approved') return isActive ? 'active' : 'inactive';
  return status === 'rejected' ? 'rejected' : 'pending';
};

export function getDishActionTransition(
  current: DishStatusSnapshot,
  action: DishManagementAction,
  reason = ''
): { next: DishStatusSnapshot; reason: string | null } | { error: string } {
  const normalizedReason = reason.trim();
  if ((action === 'reject' || action === 'unpublish') && normalizedReason.length < 5) {
    return {
      error:
        action === 'reject'
          ? 'A rejection reason of at least 5 characters is required.'
          : 'An unpublish reason of at least 5 characters is required.',
    };
  }

  if (action === 'approve') {
    if (current.status !== 'pending') return { error: 'Only pending dishes can be approved.' };
    return { next: { status: 'approved', isActive: true }, reason: null };
  }
  if (action === 'reject') {
    if (current.status !== 'pending') return { error: 'Only pending dishes can be rejected.' };
    return {
      next: { status: 'rejected', isActive: false },
      reason: normalizedReason,
    };
  }
  if (action === 'unpublish') {
    if (current.status !== 'approved' || !current.isActive) {
      return { error: 'Only active, approved dishes can be unpublished.' };
    }
    return {
      next: { status: 'approved', isActive: false },
      reason: normalizedReason,
    };
  }
  if (action === 'republish') {
    if (current.status !== 'approved' || current.isActive) {
      return { error: 'Only inactive, previously approved dishes can be republished.' };
    }
    return { next: { status: 'approved', isActive: true }, reason: null };
  }
  if (current.status !== 'rejected') {
    return { error: 'Only rejected dishes can be restored to pending review.' };
  }
  return { next: { status: 'pending', isActive: false }, reason: null };
}
