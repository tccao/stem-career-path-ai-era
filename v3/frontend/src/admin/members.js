// Member management — extend or revoke the access window (V3-Plan §5).
import { httpsCallable } from 'firebase/functions';
import { fns } from '../firebase.js';

export const extendMember = httpsCallable(fns, 'extendMember'); // bumps accessEnds (re-mints claim)
export const revokeMember = httpsCallable(fns, 'revokeMember'); // → ENDED + revokeRefreshTokens
