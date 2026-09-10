import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ADMIN_SHARED_STYLES, ADMIN_THEME } from '../src/admin/theme';

const DASHBOARD_TABS = ['overview', 'users', 'cooks', 'dishes', 'moderation', 'orders'];

describe('admin dashboard theme', () => {
  it('keeps the core page and data-surface measurements centralized', () => {
    expect(ADMIN_THEME.layout.pagePadding).toBe(24);
    expect(ADMIN_THEME.layout.controlHeight).toBe(42);
    expect(ADMIN_THEME.layout.tableHeaderHeight).toBe(45);
    expect(ADMIN_THEME.layout.tableRowHeight).toBe(72);
    expect(ADMIN_SHARED_STYLES.pageTitle.fontFamily).toBe(ADMIN_THEME.fonts.bold);
    expect(ADMIN_SHARED_STYLES.searchInput.fontFamily).toBe(ADMIN_THEME.fonts.regular);
  });

  it.each(DASHBOARD_TABS)('%s uses the shared admin page typography', tab => {
    const source = readFileSync(
      join(process.cwd(), 'app', 'admin', '(dashboard)', `${tab}.tsx`),
      'utf8'
    );
    expect(source).toContain('ADMIN_SHARED_STYLES');
    expect(source).toMatch(/page:\s*ADMIN_SHARED_STYLES\.page/);
    expect(source).toMatch(/(?:pageTitle|title):\s*ADMIN_SHARED_STYLES\.pageTitle/);
    expect(source).not.toContain('fontWeight:');
  });
});
