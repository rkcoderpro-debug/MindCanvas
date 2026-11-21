// @vitest-environment node
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationFiles = readdirSync(new URL('../../../../supabase/migrations/', import.meta.url))
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .sort();

describe('Supabase migration order', () => {
  it('rejects duplicate migration numbers with the conflicting filenames', () => {
    const filesByNumber = new Map<string, string[]>();
    for (const file of migrationFiles) {
      const number = String(Number(file.split('_')[0]));
      filesByNumber.set(number, [...(filesByNumber.get(number) ?? []), file]);
    }
    const duplicates = [...filesByNumber.values()].filter(files => files.length > 1);
    expect(duplicates, 'Each SQL migration must have its own number').toEqual([]);
  });

  it('keeps the v5.19 notifications migration before the v5.20 Lab migration', () => {
    const notifications = '0031_v5_19_0_activity_notifications.sql';
    const lab = '0032_v5_20_0_lab_library.sql';
    expect(migrationFiles).toContain(notifications);
    expect(migrationFiles).toContain(lab);
    expect(migrationFiles.indexOf(lab)).toBeGreaterThan(migrationFiles.indexOf(notifications));
  });
});
