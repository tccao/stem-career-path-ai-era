// Express app factory. Mirrors the production API Gateway routing (docs §2): one HTTP
// surface, routes split by trust zone. Here that split lives in the v1 sub-routers.
//
// Versioning: each API version is mounted at its own /api/<version> prefix so versions run
// side-by-side. Adding v2 later = create routes/v2/index.mjs and add one app.use line.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import v1Router from './routes/v1/index.mjs';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp() {
  const app = express();
  app.use(express.json());

  // Infra health (unversioned, for the load balancer / container healthcheck).
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'cfg-v2-demo',
      endpoint: config.endpoint || 'aws',
      apiVersions: ['v1'],
    });
  });

  // Versioned API surface.
  app.use('/api/v1', v1Router);
  // app.use('/api/v2', v2Router);  // future — v1 keeps working untouched

  // Unknown API path -> JSON 404 (kept above static so the SPA fallback can't mask it).
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', path: req.originalUrl }));

  // Static admin/student UI.
  app.use(express.static(publicDir));

  return app;
}

export default createApp;
