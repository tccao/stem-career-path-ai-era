// Auth routes (demo Cognito stand-in). POST /api/v1/auth/login, GET /api/v1/auth/me.

import { Router } from 'express';
import { login, authenticate } from '../../services/auth.mjs';
import { route, badRequest } from './_helpers.mjs';

const r = Router();

r.post(
  '/login',
  route(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw badRequest('email and password required');
    const result = await login(email, password);
    if (!result) return res.status(401).json({ error: 'invalid_credentials' });
    res.json(result);
  }),
);

r.get('/me', authenticate, (req, res) => {
  res.json({ user: { memberId: req.user.sub, email: req.user.email, role: req.user.role } });
});

export default r;
