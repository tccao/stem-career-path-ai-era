// Compute sequential stage state from the (cached) static curriculum + the member's
// completed stages. On Spark there is no server runtime, so gating order is derived here;
// the access WINDOW is still enforced server-side by Firestore Rules (Spark-Backend.md §3).
import { loadCurriculum } from '../lib/cache.js';

export async function getPath(pathKey) {
  const cur = await loadCurriculum();
  return cur[pathKey] || cur.fasttrack; // default to fast track
}

// Returns { title, duration, stages: [{...def, state}], done, total, nextKey }.
// state: 'complete' | 'active' (the next open stage) | 'locked'.
export async function getStageView(pathKey, completedKeys) {
  const path = await getPath(pathKey);
  const defs = path.stages || [];
  const nextKey = defs.find((s) => !completedKeys.includes(s.key))?.key ?? null;
  const stages = defs.map((s) => ({
    ...s,
    state: completedKeys.includes(s.key) ? 'complete' : (s.key === nextKey ? 'active' : 'locked'),
  }));
  return { title: path.title, duration: path.duration, stages, done: completedKeys.length, total: defs.length, nextKey };
}
