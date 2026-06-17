// DEMO auth shim — a deliberately small stand-in for Amazon Cognito (see ADR-001).
// It issues an HMAC-signed, JWT-shaped token carrying { sub, email, role }. The role claim
// is what the admin route guard checks server-side — exactly the trust boundary Cognito
// groups enforce in production (Arch §6.1). NOT production auth: no MFA, no refresh, no rotation.

import crypto from 'node:crypto';
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

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) =>
  crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');

export function createToken(payload, { ttlSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ ...payload, iat: now, exp: now + ttlSeconds });
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  if (sign(`${head}.${body}`) !== sig) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export async function login(email, password) {
  const cred = await demoAuth.getCredential(email);
  if (!cred || !verifyPassword(password, cred.passwordHash)) return null;
  const token = createToken({ sub: cred.memberId, email, role: cred.role });
  return { token, user: { memberId: cred.memberId, email, role: cred.role } };
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
