// Boots the HTTP server. Run: npm start  (after `npm run db:create` and `npm run db:seed`).

import { createApp } from './app.mjs';
import { config } from './config.mjs';

const app = createApp();

app.listen(config.port, () => {
  console.log(
    `cfg-v2-demo on http://localhost:${config.port}  ` +
      `(API /api/${config.apiVersion}, data endpoint ${config.endpoint || 'real AWS'})`,
  );
});
