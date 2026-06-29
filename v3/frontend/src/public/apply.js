import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { ensureAnonymous } from '../lib/auth.js';

const submitApplication = httpsCallable(functions, 'submitApplication', { timeout: 30_000 });

export async function apply(form) {
  await ensureAnonymous();
  const result = await submitApplication({
    name: String(form.name || '').trim(),
    email: String(form.email || '').trim(),
    ageBracket: form.ageBracket,
    guardianConsent: form.guardianConsent === true,
    accessChoice: form.accessChoice,
    stage: String(form.stage || '').trim(),
    track: form.track,
    reason: String(form.reason || '').trim(),
  });
  return result.data;
}
