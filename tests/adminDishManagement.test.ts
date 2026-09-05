import {
  deriveDishManagementStatus,
  getDishActionTransition,
} from '../backend/adminDishManagement';

describe('admin dish management', () => {
  it('derives the dashboard status from review and publication state', () => {
    expect(deriveDishManagementStatus({ status: 'approved', isActive: true })).toBe('active');
    expect(deriveDishManagementStatus({ status: 'approved', isActive: false })).toBe('inactive');
    expect(deriveDishManagementStatus({ status: 'pending', isActive: false })).toBe('pending');
    expect(deriveDishManagementStatus({ status: 'rejected', isActive: false })).toBe('rejected');
  });

  it('approves pending dishes and publishes them', () => {
    expect(getDishActionTransition({ status: 'pending', isActive: false }, 'approve')).toEqual({
      next: { status: 'approved', isActive: true },
      reason: null,
    });
  });

  it('requires a meaningful reason when rejecting or unpublishing', () => {
    expect(
      getDishActionTransition({ status: 'pending', isActive: false }, 'reject', 'bad')
    ).toEqual({
      error: 'A rejection reason of at least 5 characters is required.',
    });
    expect(
      getDishActionTransition({ status: 'approved', isActive: true }, 'unpublish', 'bad')
    ).toEqual({
      error: 'An unpublish reason of at least 5 characters is required.',
    });
  });

  it('rejects a pending dish and keeps the normalized reason', () => {
    expect(
      getDishActionTransition(
        { status: 'pending', isActive: false },
        'reject',
        '  Misleading photo  '
      )
    ).toEqual({
      next: { status: 'rejected', isActive: false },
      reason: 'Misleading photo',
    });
  });

  it('supports the approved dish publication lifecycle', () => {
    expect(
      getDishActionTransition(
        { status: 'approved', isActive: true },
        'unpublish',
        'Needs correction'
      )
    ).toEqual({
      next: { status: 'approved', isActive: false },
      reason: 'Needs correction',
    });
    expect(getDishActionTransition({ status: 'approved', isActive: false }, 'republish')).toEqual({
      next: { status: 'approved', isActive: true },
      reason: null,
    });
  });

  it('clears a rejection back to unpublished pending review', () => {
    expect(
      getDishActionTransition({ status: 'rejected', isActive: false }, 'clear_rejection')
    ).toEqual({
      next: { status: 'pending', isActive: false },
      reason: null,
    });
  });

  it('blocks actions from invalid source states', () => {
    expect(
      getDishActionTransition({ status: 'approved', isActive: true }, 'approve')
    ).toHaveProperty('error');
    expect(
      getDishActionTransition({ status: 'pending', isActive: false }, 'republish')
    ).toHaveProperty('error');
    expect(
      getDishActionTransition({ status: 'pending', isActive: false }, 'clear_rejection')
    ).toHaveProperty('error');
  });
});
