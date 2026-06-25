// Admin review queue + state-machine actions. All actions are role-gated callables;
// the server enforces every transition with a Firestore transaction (V3-Plan §3).
import { httpsCallable } from 'firebase/functions';
import { fns } from '../firebase.js';

export const listApplications = httpsCallable(fns, 'listApplications'); // { status }
export const approveApplication = httpsCallable(fns, 'approveApplication'); // beneficiary → GRANTED
export const rejectApplication = httpsCallable(fns, 'rejectApplication');
