// Public intake (the public-fn trust zone, Arch §3). POST /api/v1/applications.
// Validates input + runs the age/consent gate in code before creating the application
// (HTTP APIs have no built-in request validation — Arch §4/§8.2).

import { Router } from 'express';
import * as lc from '../../services/lifecycle.mjs';
import { route, badRequest } from './_helpers.mjs';

const r = Router();

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
    res.status(201).json({ applicationId: app.applicationId, status: app.status });
  }),
);

export default r;
