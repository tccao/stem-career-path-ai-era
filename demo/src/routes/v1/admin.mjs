// Admin routes (the app-fn admin trust zone, Arch §3). Every route is guarded server-side:
// authenticate -> requireRole('admin'). Unauth = 401, wrong role = 403 (Arch §6.1).
// The role check is enforced here, never trusted from the client.

import { Router } from 'express';
import { authenticate, requireRole } from '../../services/auth.mjs';
import * as lc from '../../services/lifecycle.mjs';
import * as appsRepo from '../../repositories/applications.mjs';
import * as membersRepo from '../../repositories/members.mjs';
import * as audit from '../../repositories/audit.mjs';
import { route } from './_helpers.mjs';

const r = Router();
r.use(authenticate, requireRole('admin'));

const actor = (req) => req.user.sub || req.user.email;

// ---- dashboard overview (counts by lifecycle status) ----
r.get(
  '/overview',
  route(async (req, res) => {
    const statuses = [
      lc.STATUS.SUBMITTED,
      lc.STATUS.INTERVIEW_SCHEDULED,
      lc.STATUS.DONATION_REQUIRED,
      lc.STATUS.APPROVED_BENEFICIARY,
      lc.STATUS.DONATION_CONFIRMED,
    ];
    const counts = {};
    for (const s of statuses) counts[s] = (await appsRepo.listByStatus(s)).length;
    const members = await membersRepo.listMembers();
    counts.ACTIVE_MEMBERS = members.filter((m) => m.status === 'ACTIVE' && m.role === 'student').length;
    res.json({ counts });
  }),
);

// ---- applications queue ----
r.get(
  '/applications',
  route(async (req, res) => {
    const status = req.query.status || lc.STATUS.SUBMITTED;
    const items = await appsRepo.listByStatus(status);
    res.json({ status, count: items.length, items });
  }),
);

r.get(
  '/applications/:id',
  route(async (req, res) => {
    const application = await appsRepo.getApplication(req.params.id);
    if (!application) return res.status(404).json({ error: 'not_found' });
    const auditEvents = await audit.listForTarget('application', req.params.id);
    res.json({ application, audit: auditEvents });
  }),
);

// ---- application decisions (drive the state machine) ----
r.post(
  '/applications/:id/schedule-interview',
  route(async (req, res) => {
    const out = await lc.scheduleInterview(req.params.id, {
      actorId: actor(req),
      interviewAt: req.body?.interviewAt || new Date().toISOString(),
    });
    res.json(out);
  }),
);

r.post(
  '/applications/:id/approve',
  route(async (req, res) => res.json(await lc.approveBeneficiary(req.params.id, { actorId: actor(req) }))),
);

r.post(
  '/applications/:id/require-donation',
  route(async (req, res) => res.json(await lc.requireDonation(req.params.id, { actorId: actor(req) }))),
);

r.post(
  '/applications/:id/request-info',
  route(async (req, res) =>
    res.json(await lc.requestInfo(req.params.id, { actorId: actor(req), reasonCode: req.body?.reasonCode })),
  ),
);

r.post(
  '/applications/:id/reject',
  route(async (req, res) =>
    res.json(await lc.rejectApplication(req.params.id, { actorId: actor(req), reasonCode: req.body?.reasonCode })),
  ),
);

r.post(
  '/applications/:id/confirm-donation',
  route(async (req, res) => res.json(await lc.confirmDonation(req.params.id, { actorId: actor(req) }))),
);

r.post(
  '/applications/:id/provision',
  route(async (req, res) => res.json(await lc.provision(req.params.id, { actorId: actor(req) }))),
);

// ---- members ----
r.get(
  '/members',
  route(async (req, res) => {
    const items = (await membersRepo.listMembers()).filter((m) => m.role === 'student');
    res.json({ count: items.length, items });
  }),
);

r.post(
  '/members/:id/extend',
  route(async (req, res) =>
    res.json(await lc.extendMember(req.params.id, { actorId: actor(req), days: Number(req.body?.days) || 120 })),
  ),
);

r.post(
  '/members/:id/revoke',
  route(async (req, res) =>
    res.json(await lc.revokeMember(req.params.id, { actorId: actor(req), reasonCode: req.body?.reasonCode })),
  ),
);

// ---- audit view (read-only) ----
r.get(
  '/audit/:targetType/:targetId',
  route(async (req, res) =>
    res.json({ items: await audit.listForTarget(req.params.targetType, req.params.targetId) }),
  ),
);

export default r;
