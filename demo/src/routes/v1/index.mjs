// API v1 router. All v1 resources mount here; a future v2 gets its own routes/v2/index.mjs
// mounted side-by-side at /api/v2 (see app.mjs) so v1 clients never break.

import { Router } from 'express';
import authRouter from './auth.mjs';
import publicRouter from './public.mjs';
import adminRouter from './admin.mjs';
import contentRouter from './content.mjs';

const router = Router();

// Version discovery / liveness for this API version.
router.get('/', (req, res) => {
  res.json({ version: 'v1', status: 'ok', resources: ['/auth', '/applications', '/admin', '/curriculum'] });
});

router.get('/health', (req, res) => {
  res.json({ version: 'v1', status: 'ok' });
});

// Trust zones (Arch section 3): public intake, authed admin, public curriculum reads.
router.use('/auth', authRouter);
router.use('/applications', publicRouter);
router.use('/admin', adminRouter);
router.use('/curriculum', contentRouter);

export default router;
