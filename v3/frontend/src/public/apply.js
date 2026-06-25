// Public apply / fund-a-seat. Spark/Functions-free: anonymous sign-in, then write the
// application directly to Firestore. The age/consent gate + shape are enforced by Security
// Rules (under-13 denied; 13–17 needs guardian consent) — see firestore.rules.
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ulid } from 'ulid';
import { db } from '../firebase.js';
import { ensureAnonymous } from '../lib/auth.js';

export async function apply(form) {
  // form: { name, email, ageBracket: 'under13'|'13-17'|'18plus', guardianConsent?, accessChoice }
  await ensureAnonymous();
  const id = ulid();
  await setDoc(doc(collection(db, 'applications'), id), {
    status: 'SUBMITTED',
    accessChoice: form.accessChoice,        // 'beneficiary' | 'supporter'
    email: form.email,
    name: form.name,
    ageBracket: form.ageBracket,
    guardianConsent: form.guardianConsent ?? false,
    createdAt: serverTimestamp(),
  }); // Rules reject under-13 / missing consent / bad shape
  return { applicationId: id, status: 'SUBMITTED', next: form.accessChoice === 'supporter' ? 'donate' : 'review' };
}
