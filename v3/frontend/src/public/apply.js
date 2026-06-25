// Public apply / fund-a-seat. No auth. Calls the public callable; server runs the
// age/consent gate and creates the SUBMITTED application (V3-Plan §3).
import { httpsCallable } from 'firebase/functions';
import { fns } from '../firebase.js';

const submitApplication = httpsCallable(fns, 'submitApplication');

export async function apply(form) {
  // form: { name, email, ageBracket, guardianConsent?, accessChoice: 'beneficiary'|'supporter' }
  const { data } = await submitApplication(form);
  return data; // { applicationId, status: 'SUBMITTED', next: 'review'|'donate' }
}
