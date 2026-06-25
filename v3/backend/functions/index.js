// Cloud Functions entrypoint — re-exports every callable + trigger (V3-Plan §6).
// firebase-admin is initialized once here; all modules import the shared db/auth.
import { initializeApp } from 'firebase-admin/app';
initializeApp();

// Public (no auth)
export { submitApplication } from './src/lifecycle.js';
export { verifyDonation } from './src/donations.js';
export { redeemCode } from './src/access.js';

// Student (role=student + ACTIVE window, enforced in-handler)
export { submitStage, getSignedAsset } from './src/student.js';

// Admin (role=admin, enforced in-handler)
export {
  listApplications, approveApplication, rejectApplication,
  extendMember, revokeMember,
} from './src/admin.js';

// Triggers — read-light aggregates + scheduled expiry
export { onProgressWrite, onApplicationWrite } from './src/aggregates.js';
export { expirySweep } from './src/expiry.js';
