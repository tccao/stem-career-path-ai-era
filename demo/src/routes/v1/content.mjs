// Curriculum read routes (public program overview). GET /api/v1/curriculum[/:pathKey].
// In production the gated bytes come from CloudFront signed cookies; here it's a DB read.

import { Router } from 'express';
import * as content from '../../repositories/content.mjs';
import { route } from './_helpers.mjs';

const r = Router();

r.get(
  '/',
  route(async (req, res) => {
    res.json({ paths: ['A_full_roadmap', 'B_fast_track'] });
  }),
);

r.get(
  '/:pathKey',
  route(async (req, res) => {
    const items = await content.getPath(req.params.pathKey);
    if (!items.length) return res.status(404).json({ error: 'not_found' });
    const meta = items.find((i) => i.stageKey === '_meta') || null;
    const stages = items
      .filter((i) => i.stageKey !== '_meta')
      .sort((a, b) => (a.n || a.week || 0) - (b.n || b.week || 0));
    res.json({ pathKey: req.params.pathKey, meta, stages });
  }),
);

export default r;
