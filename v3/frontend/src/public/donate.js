// Supporter self-serve. Card entry happens off-stack on Zeffy (PCI SAQ-A). After the
// hosted donation, verifyDonation confirms it server-side → auto-grant (V3-Plan §5).
import { httpsCallable } from 'firebase/functions';
import { fns } from '../firebase.js';

const verifyDonation = httpsCallable(fns, 'verifyDonation');

export async function confirmDonation({ applicationId, zeffyPaymentId }) {
  // Server reads Zeffy read-only to verify; idempotent on zeffyPaymentId. Never trusts
  // a raw client "I paid". On success the magic link is emailed.
  const { data } = await verifyDonation({ applicationId, zeffyPaymentId });
  return data; // { status: 'GRANTED', emailedMagicLink: true }
}
