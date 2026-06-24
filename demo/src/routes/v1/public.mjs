// Public intake (the public-fn trust zone, Arch §3). POST /api/v1/applications.
// Validates input + runs the age/consent gate in code before creating the application
// (HTTP APIs have no built-in request validation — Arch §4/§8.2).

import { Router } from 'express';
import * as lc from '../../services/lifecycle.mjs';
import { route, badRequest } from './_helpers.mjs';

const r = Router();

// Accepted `accessChoice` values that mean "I want to fund a seat" (self-serve supporter).
const SUPPORTER_CHOICES = new Set(['supporter', 'fund_a_seat', 'donor']);

r.post(
  '/',
  route(async (req, res) => {
    const b = req.body || {};
    if (!b.email || !b.fullName) throw badRequest('email and fullName are required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw badRequest('invalid email');

    // Age / guardian-consent gate (Platform-SRS §6): under-13 not accepted; 13-17 need consent.
    if (b.ageBracket === 'under_13') {
      throw badRequest('Applicants under 13 are not accepted (COPPA).', 'age_ineligible');
    }
    if (b.ageBracket === '13_17' && !b.guardianConsentAt) {
      throw badRequest('Guardian consent required for ages 13-17.', 'guardian_consent_required');
    }

    const app = await lc.submitApplication({
      email: b.email,
      fullName: b.fullName,
      stage: b.stage,
      preferredTrack: b.preferredTrack,
      background: b.background,
      links: b.links,
      ageBracket: b.ageBracket,
      guardianConsentAt: b.guardianConsentAt,
    });

    // Self-serve supporter: choosing to fund a seat skips the interview entirely
    // (Customer-Journey §4). The applicant moves straight to DONATION_REQUIRED, then donates.
    if (SUPPORTER_CHOICES.has(b.accessChoice)) {
      const updated = await lc.chooseFundASeat(app.applicationId, { actorId: 'self' });
      return res.status(201).json({
        applicationId: app.applicationId,
        status: updated.status, // DONATION_REQUIRED
        accessBasis: 'supporter',
        next: 'donate',
        // Demo stand-in for the Zeffy hosted-donation link-out; POST here to simulate paying.
        donateUrl: `/api/v1/applications/${app.applicationId}/donate`,
      });
    }

    res.status(201).json({ applicationId: app.applicationId, status: app.status });
  }),
);

// Self-serve donation (public, no auth). Demo stand-in for: the applicant donates on Zeffy's
// hosted page AND system-fn's read-only poll verifies the payment. On verification it
// auto-provisions access — NO admin interview, NO manual approval (Customer-Journey §5.1).
// Production NEVER trusts a client "I paid" signal; the verification is server-side (see
// services/lifecycle.mjs selfServeSupporterGrant). Idempotent on repeat calls.
r.post(
  '/:id/donate',
  route(async (req, res) => {
    const out = await lc.selfServeSupporterGrant(req.params.id, {
      actorId: 'system',
      zeffyPaymentId: req.body?.zeffyPaymentId,
    });
    res.status(out.alreadyProvisioned ? 200 : 201).json({
      applicationId: req.params.id,
      status: lc.STATUS.ACTIVE,
      memberId: out.memberId,
      accessBasis: 'supporter',
      alreadyProvisioned: out.alreadyProvisioned,
      // DEMO ONLY: prod emails a temp password via SES and never returns it in an API response.
      demoLogin: out.tempPassword ? { email: out.application?.email, tempPassword: out.tempPassword } : undefined,
    });
  }),
);

export default r;
