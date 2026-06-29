import { HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { auth, db, Timestamp } from './context.js';
import { IS_EMULATOR, REVOCATION_RETENTION_MS } from './config.js';

export const roleOf = (req) => req.auth?.token?.role || null;

function denied(message) {
  throw new HttpsError('permission-denied', message);
}

export function assertAuthenticated(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'sign-in required');
  return req.auth.uid;
}

export async function assertCurrentToken(req) {
  const uid = assertAuthenticated(req);
  const authTime = Number(req.auth.token?.auth_time || 0);
  const revocation = await db.collection('revocations').doc(uid).get();
  if (revocation.exists && (
    req.auth.token?.sessionVersion !== revocation.get('sessionVersion')
    || authTime < Number(revocation.get('revokeTime') || 0) - 1
  )) {
    throw new HttpsError('unauthenticated', 'session revoked; sign in again');
  }
  return uid;
}

export async function assertNotLockedDown(req) {
  if (roleOf(req) === 'owner') return;
  const lockdown = await db.doc('system/lockdown').get();
  if (lockdown.exists && lockdown.get('enabled') === true) {
    throw new HttpsError('unavailable', 'system lockdown is active');
  }
}

function hasMfaClaim(req) {
  return req.auth?.token?.mfaEnrolled === true
    && (IS_EMULATOR ? req.auth?.token?.testMfa === true : true);
}

async function hasEnrolledFactor(uid) {
  if (IS_EMULATOR) return true;
  const user = await auth.getUser(uid);
  return user.disabled !== true && (user.multiFactor?.enrolledFactors?.length || 0) > 0;
}

export async function assertStaff(req, { ownerOnly = false, allowDuringLockdown = false } = {}) {
  const uid = await assertCurrentToken(req);
  const role = roleOf(req);
  if (ownerOnly ? role !== 'owner' : !['admin', 'owner'].includes(role)) denied(ownerOnly ? 'owner only' : 'staff only');
  if (!hasMfaClaim(req) || !(await hasEnrolledFactor(uid))) denied('staff MFA required');
  if (!allowDuringLockdown) await assertNotLockedDown(req);
  return { uid, role };
}

// Used only to bind a freshly enrolled TOTP factor to the mfaEnrolled authorization claim.
export async function assertStaffMfaBootstrap(req) {
  const uid = await assertCurrentToken(req);
  if (!['admin', 'owner'].includes(roleOf(req))) denied('staff only');
  await assertNotLockedDown(req);
  const user = await auth.getUser(uid);
  if (user.disabled || !(user.multiFactor?.enrolledFactors?.length > 0)) denied('enroll a TOTP factor first');
  return { uid, user };
}

export async function assertActiveStudent(req) {
  const uid = await assertCurrentToken(req);
  if (roleOf(req) !== 'student') denied('student only');
  if (!(Number(req.auth.token?.accessEnds || 0) > Date.now())) denied('access expired');
  await assertNotLockedDown(req);
  return uid;
}

export async function assertAnonymousApplicant(req) {
  const uid = await assertCurrentToken(req);
  if (req.auth.token?.firebase?.sign_in_provider !== 'anonymous' && !IS_EMULATOR) denied('anonymous applicant session required');
  return uid;
}

export async function assertTargetNotStaff(uid) {
  const user = await auth.getUser(uid).catch(() => null);
  const role = user?.customClaims?.role;
  if (role === 'admin' || role === 'owner') denied('member operation cannot target staff');
  return user;
}

export async function recordSessionRevocation(uid) {
  const before = await auth.getUser(uid);
  const sessionVersion = randomUUID();
  await auth.setCustomUserClaims(uid, { ...(before.customClaims || {}), sessionVersion });
  await auth.revokeRefreshTokens(uid);
  const user = await auth.getUser(uid);
  const revokeTime = Math.floor(new Date(user.tokensValidAfterTime).getTime() / 1000);
  await db.collection('revocations').doc(uid).set({
    revokeTime,
    sessionVersion,
    expiresAt: Timestamp.fromMillis(Date.now() + REVOCATION_RETENTION_MS),
  });
  return revokeTime;
}
