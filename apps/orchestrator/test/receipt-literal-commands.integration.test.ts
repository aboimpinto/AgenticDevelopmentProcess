import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";

it('imports real quoted commands with capture and reaches coverage without repair or rerunning tests', async () => {
  let repairs = 0, original = '';
  const f = await freshVerificationFixture('console-capture', {
    // Real bash executes these quoted argv words; the admitted plan is unquoted.
    presentCommand: command => command.split(' ').map(word => `'${word}'`).join('  '),
    afterExecution: directory => { original = readFileSync(join(directory, 'receipt.json'), 'utf8'); },
    repairEvidence: () => { repairs++; },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, {cardId:f.feature.id, reassess:true, verifyExisting:true});
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe('passed');
    expect(m.activities).toContain('assessing');
    expect(m.record?.unresolved).toEqual([]);
    expect(m.executions).toBe(2); expect(repairs).toBe(0);
    expect(readFileSync(join(m.fresh!.directory, 'receipt.json'), 'utf8')).toBe(original);
    expect(readdirSync(m.fresh!.directory).filter(n => n.startsWith('evidence-recovery-'))).toEqual([]);
  } finally { await f.close(); }
});
