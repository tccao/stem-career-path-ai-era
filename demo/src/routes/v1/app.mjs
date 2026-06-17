// Student app routes (the app-fn student trust zone, Arch §3). Guarded server-side:
// authenticate -> requireRole('student') -> requireActiveMember (status ACTIVE + within window).
// A revoked/expired member is bounced with 403 access_expired (Arch §6.1), never trusted client-side.

import { Router } from 'express';
import { authenticate, requireRole } from '../../services/auth.mjs';
import * as membersRepo from '../../repositories/members.mjs';
import * as progressRepo from '../../repositories/progress.mjs';
import * as student from '../../services/student.mjs';
import { route } from './_helpers.mjs';

const r = Router();
r.use(authenticate, requireRole('student'));

// Access-window guard: loads the member and verifies ACTIVE + not lapsed.
r.use(async (req, res, next) => {
  try {
    const m = await membersRepo.getMember(req.user.sub);
    if (!m) return res.status(403).json({ error: 'forbidden', reason: 'no_member' });
    if (m.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'access_expired', reason: 'not_active', status: m.status });
    }
    if (m.accessEndsAt && new Date(m.accessEndsAt) < new Date()) {
      return res.status(403).json({ error: 'access_expired', reason: 'window_lapsed' });
    }
    req.member = m;
    next();
  } catch (e) {
    next(e);
  }
});

const publicMember = (m) => ({
  memberId: m.memberId,
  fullName: m.fullName,
  email: m.email,
  role: m.role,
  accessBasis: m.accessBasis, // reporting metadata only — NOT a permission (Arch §6.1)
  path: m.path,
  status: m.status,
  accessEndsAt: m.accessEndsAt,
});

r.get('/profile', route(async (req, res) => res.json({ member: publicMember(req.member) })));

r.get('/path', route(async (req, res) => res.json(await student.getPathView(req.member))));

r.post(
  '/stages/:stageKey/submit',
  route(async (req, res) =>
    res.json(await student.submitStage(req.member, req.params.stageKey, req.body?.deliverableUrl)),
  ),
);

r.get(
  '/progress',
  route(async (req, res) => res.json({ items: await progressRepo.listProgress(req.member.memberId) })),
);

export default r;
