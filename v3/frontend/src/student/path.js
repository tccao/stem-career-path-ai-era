// Renders the learning path from the (cached) static curriculum + the per-stage gating
// state carried in memberDashboard. Curriculum costs 0 Firestore reads (V3-Plan §4).
import { loadCurriculum } from '../lib/cache.js';

export async function buildPathView(dashboard) {
  const curriculum = await loadCurriculum();
  const path = curriculum[dashboard.path]; // 'fasttrack' | 'roadmap'
  // Merge static stage definitions with dashboard.stages[] (locked/active/complete).
  return path.stages.map((s) => ({
    ...s,
    state: dashboard.stages.find((x) => x.key === s.key)?.state ?? 'locked',
  }));
}
