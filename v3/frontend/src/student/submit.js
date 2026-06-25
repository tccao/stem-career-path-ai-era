// Submit a stage deliverable. Server re-derives gating (never trusts the client) and,
// on success, the aggregates trigger rebuilds memberDashboard (V3-Plan §4/§8).
import { httpsCallable } from 'firebase/functions';
import { fns } from '../firebase.js';

const submitStage = httpsCallable(fns, 'submitStage');

export async function submit(stageKey, deliverableUrl) {
  const { data } = await submitStage({ stageKey, deliverableUrl });
  return data; // { stageKey, status: 'complete', unlocked: '<nextStageKey>' }
}
