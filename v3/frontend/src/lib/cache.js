// Read-light helpers (V3-Plan §4). Curriculum is static → served from the build bundle
// and cached in localStorage by version, so it costs 0 Firestore reads after first load.
let _curriculum = null;

export async function loadCurriculum() {
  if (_curriculum) return _curriculum;
  // 'no-cache' = always revalidate with the server (304 if unchanged) so a redeploy of
  // curriculum.json is never served stale. (force-cache caused an empty dashboard after
  // the curriculum was populated — the browser kept the old empty copy.)
  const res = await fetch('/curriculum.json', { cache: 'no-cache' });
  _curriculum = await res.json();
  return _curriculum;
}

// The student dashboard is a single denormalized doc (memberDashboard/{uid}) → 1 read,
// then served from the Firestore IndexedDB cache on repeat views (see firebase.js).
