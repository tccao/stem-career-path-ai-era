// Public apply / fund-a-seat. Spark/Functions-free: anonymous sign-in, then write the
// application directly to Firestore. The accepted age groups, guardian-consent requirement,
// and document shape are enforced by Security Rules — see firestore.rules.
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ulid } from 'ulid';
import { db } from '../firebase.js';
import { ensureAnonymous } from '../lib/auth.js';

export async function apply(form) {
  // form: { name, email, ageBracket: '13-17'|'18plus', guardianConsent?, accessChoice, stage, track, reason }
  await ensureAnonymous();
  const id = ulid();
  await setDoc(doc(collection(db, 'applications'), id), {
    status: 'SUBMITTED',
    accessChoice: form.accessChoice,        // 'beneficiary' | 'supporter'
    email: form.email,
    name: form.name,
    ageBracket: form.ageBracket,
    guardianConsent: form.guardianConsent ?? false,
    stage: form.stage || '',
    track: form.track || '',
    reason: form.reason || '',
    createdAt: serverTimestamp(),
  }); // Rules reject undeclared age groups, missing minor consent, and bad shapes.
  return { applicationId: id, status: 'SUBMITTED', next: form.accessChoice === 'supporter' ? 'donate' : 'review' };
}
