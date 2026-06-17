// Seed the real curriculum (extracted from the reference PDFs into src/content/curriculum.json)
// into the Curriculum table. One row per pillar (path A) and per week (path B), plus a _meta row.
//
//   npm run db:create && node scripts/seed-curriculum.mjs

import fs from 'node:fs';
import { createTables } from './create-tables.mjs';
import * as content from '../src/repositories/content.mjs';

const curriculum = JSON.parse(
  fs.readFileSync(new URL('../src/content/curriculum.json', import.meta.url), 'utf8'),
);

export async function seedCurriculum() {
  const A = curriculum.paths.A_full_roadmap;
  const B = curriculum.paths.B_fast_track;

  await content.putCurriculumItem({
    pathKey: A.key,
    stageKey: '_meta',
    title: A.title,
    duration: A.duration,
    kind: 'roadmap',
  });
  for (const p of A.pillars) {
    await content.putCurriculumItem({
      pathKey: A.key,
      stageKey: p.key, // e.g. pillar1
      kind: 'pillar',
      n: p.n,
      title: p.title,
      description: p.description,
      milestones: p.milestones,
    });
  }

  await content.putCurriculumItem({
    pathKey: B.key,
    stageKey: '_meta',
    title: B.title,
    duration: B.duration,
    kind: 'fasttrack',
  });
  for (const w of B.weeks) {
    await content.putCurriculumItem({
      pathKey: B.key,
      stageKey: w.key, // e.g. wk1
      kind: 'week',
      week: w.week,
      focus: w.focus,
      days: w.days,
    });
  }

  return { pillars: A.pillars.length, weeks: B.weeks.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createTables({ reset: false });
  const r = await seedCurriculum();
  console.log(`Seeded curriculum: ${r.pillars} pillars + ${r.weeks} fast-track weeks.`);
}
