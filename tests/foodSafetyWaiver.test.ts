import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOOD_SAFETY_WAIVER_ACCEPTANCE,
  FOOD_SAFETY_WAIVER_SECTIONS,
  FOOD_SAFETY_WAIVER_TEXT,
  FOOD_SAFETY_WAIVER_VERSION,
} from '@/src/constants/foodSafetyWaiver';

describe('cook food-safety compliance clause', () => {
  it('has a stable version and canonical text snapshot', () => {
    expect(FOOD_SAFETY_WAIVER_VERSION).toBe('2026-07-22-v1');
    expect(FOOD_SAFETY_WAIVER_TEXT).toContain('Registration and licensing');
    expect(FOOD_SAFETY_WAIVER_TEXT).toContain('Acknowledgement and indemnity');
    expect(FOOD_SAFETY_WAIVER_ACCEPTANCE).toContain('I have read and accept');
  });

  it('matches the protected canonical copy seeded by the migration', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260722020000_add_cook_compliance_acceptances/migration.sql'
      ),
      'utf8'
    );
    const clause = migration.match(/\$clause\$([\s\S]*?)\$clause\$/)?.[1];
    const acceptance = migration.match(/\$acceptance\$([\s\S]*?)\$acceptance\$/)?.[1];

    expect(clause).toBe(FOOD_SAFETY_WAIVER_TEXT);
    expect(acceptance).toBe(FOOD_SAFETY_WAIVER_ACCEPTANCE);
  });

  it('states the registration penalty narrowly as alternatives', () => {
    const penalties = FOOD_SAFETY_WAIVER_SECTIONS.find(
      section => section.title === 'Possible penalties'
    )?.body;

    expect(penalties).toContain('Failure to register covered food premises');
    expect(penalties).toContain('RM10,000 or imprisonment');
    expect(penalties).not.toMatch(/or both/i);
  });

  it('does not present verification documents as licences or full compliance', () => {
    const documents = FOOD_SAFETY_WAIVER_SECTIONS.find(
      section => section.title === 'Your documents'
    )?.body;

    expect(documents).toContain('These are separate requirements');
    expect(documents).toContain('Neither document proves food-premises registration');
    expect(documents).toContain('does not confirm full regulatory compliance');
  });

  it('preserves Chefin liability carve-outs', () => {
    const indemnity = FOOD_SAFETY_WAIVER_SECTIONS.find(
      section => section.title === 'Acknowledgement and indemnity'
    )?.body;

    expect(indemnity).toContain("Chefin's negligence, fraud or wilful misconduct");
    expect(indemnity).toContain('cannot lawfully be excluded or restricted');
  });
});
