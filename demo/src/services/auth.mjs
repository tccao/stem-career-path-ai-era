// DEMO auth shim — a deliberately small stand-in for Amazon Cognito (see ADR-001).
// It issues a signed JWT token carrying { sub, email, role }. The role claim
// is what the admin route guard checks server-side — exactly the trust boundary Cognito
// groups enforce in production (Arch §6.1). NOT production auth: no MFA, no refresh, no rotation.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.mjs';
import * as demoAuth from '../repositories/demoAuth.mjs';

const KEYLEN = 32;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createToken(payload, { ttlSeconds = 3600 } = {}) {
  return jwt.sign(payload, config.authSecret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.authSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export async function login(email, password) {
  const cred = await demoAuth.getCredential(email);
  if (!cred || !verifyPassword(password, cred.passwordHash)) return null;
  const token = createToken({ sub: cred.memberId, email, role: cred.role });
  return { token, user: { memberId: cred.memberId, email, role: cred.role } };
}

// Demo stand-in for Cognito AdminCreateUser. Production: system-fn creates the Cognito user with a
// temporary password (force-change on first sign-in) and SES emails it. Here we mint a DemoAuth
// credential with a generated temp password and RETURN it so the caller can surface it the way a
// welcome email would (demo only — a real API never returns a password).
export function generateTempPassword() {
  return `cfg-${crypto.randomBytes(5).toString('hex')}`; // demo-only, human-typable
}

export async function createDemoCredential({ email, memberId, role = 'student' }) {
  const tempPassword = generateTempPassword();
  await demoAuth.putCredential({
    email,
    memberId,
    role,
    passwordHash: hashPassword(tempPassword),
    mustChangePassword: true, // mirrors Cognito force-change; not enforced in the demo
  });
  return { tempPassword };
}

// ---- Express middleware (server-side route guards, Arch §6.1) ----

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : req.headers['x-demo-token'] || null;
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'unauthorized' });
  req.user = claims;
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'forbidden', reason: 'wrong_role' });
    }
    next();
  };
}
