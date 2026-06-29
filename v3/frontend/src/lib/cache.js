import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

let curriculum = null;
const getCurriculum = httpsCallable(functions, 'getCurriculum', { timeout: 30_000 });

export async function loadCurriculum() {
  if (curriculum) return curriculum;
  curriculum = (await getCurriculum()).data.curriculum;
  return curriculum;
}

export function clearCurriculumCache() {
  curriculum = null;
}
