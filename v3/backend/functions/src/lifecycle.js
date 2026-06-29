// Lifecycle state machine (V3-Plan §3). Callables + the sole account-minting path.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';
import { z } from 'zod';
import { db, auth, STATE, transition } from './_db.js';
import { audit } from './_audit.js';
import { issueCodeFor } from './access.js';
import { ACCESS_DAYS } from './config.js';

const ApplySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  ageBracket: z.enum(['13-17', '18plus']),
  guardianConsent: z.boolean().optional(),
  accessChoice: z.enum(['beneficiary', 'supporter']),
});

// PUBLIC: create a SUBMITTED application (age/consent gate runs server-side).
export const submitApplication = onCall(async (req) => {
  const data = ApplySchema.parse(req.data);
  if (data.ageBracket === '13-17' && !data.guardianConsent) {
    throw new HttpsError('failed-precondition', 'guardian_consent_required');
  }
  const applicationId = ulid();
  await db.collection('applications').doc(applicationId).set({
    status: STATE.SUBMITTED,
    accessChoice: data.accessChoice,
    email: data.email,
    name: data.name,
    createdAt: FieldValue.serverTimestamp(),
  });
  await audit({ type: 'application.submitted', targetType: 'application', targetId: applicationId, toStatus: STATE.SUBMITTED });
  return { applicationId, status: STATE.SUBMITTED, next: data.accessChoice === 'supporter' ? 'donate' : 'review' };
});

// The ONLY account-minting path (beneficiary approve OR supporter donation verified).
// Sole caller of auth.createUser. Idempotent on applicationId. Emails the magic link.
// Audit fix #1: role/window are PERSISTED via setCustomUserClaims so extend/revoke can
// later update the window without forcing a passwordless re-auth.
export async function grantAccess({ applicationId, accessBasis, accessDays = ACCESS_DAYS }) {
  const ref = db.collection('applications').doc(applicationId);
  const accessEnds = Date.now() + accessDays * 86400_000;
  const uid = (await auth.createUser({})).uid; // no email/password — passwordless
  await transition(ref, STATE.SUBMITTED, { status: STATE.GRANTED, grantedUid: uid });
  await db.collection('members').doc(uid).set({
    status: STATE.GRANTED, accessBasis, accessEnds, applicationId,
    createdAt: FieldValue.serverTimestamp(),
  });
  // Persisted claims → flow into every ID token the account mints (and survive refresh).
  await auth.setCustomUserClaims(uid, { role: 'student', accessBasis, accessEnds });
  await issueCodeFor(uid); // → emails magic link (one-time code)
  await audit({ type: 'access.granted', targetType: 'member', targetId: uid, toStatus: STATE.GRANTED });
  return { uid, status: STATE.GRANTED };
}
