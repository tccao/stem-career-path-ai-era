// SERVER-OWNED curriculum (audit fix #2). This is the single source of truth for stage
// order, sequential gating, and progress percent. The frontend ships a *copy*
// (frontend/public/curriculum.json) matched by `version` for display only — the server
// never trusts it. Populate `stages` from ../../../references (parity with demo/src/content).
export const CURRICULUM = {
  fasttrack: { version: 1, stages: [/* { key, day, title, deliverable } */] },
  roadmap:   { version: 1, stages: [/* { key, pillar, title, deliverable } */] },
};

export function stageKeys(path) {
  return (CURRICULUM[path]?.stages ?? []).map((s) => s.key);
}

/** The next not-yet-complete stage in order — the only stage a student may submit. */
export function nextOpenStage(path, completedKeys) {
  return stageKeys(path).find((k) => !completedKeys.includes(k)) ?? null;
}

export function isStageOpen(path, completedKeys, stageKey) {
  return nextOpenStage(path, completedKeys) === stageKey;
}

export function percentComplete(path, completeCount) {
  const n = stageKeys(path).length;
  return n ? Math.round((100 * completeCount) / n) : 0;
}
