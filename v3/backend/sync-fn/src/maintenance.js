import { onSchedule } from 'firebase-functions/v2/scheduler';
import { auth, db } from './context.js';
import { REGION } from './config.js';
import { STATE } from './lifecycle.js';
import { revokeStudent } from './admin.js';
import { writeAudit } from './audit.js';

export const maintenanceSweep = onSchedule({
  schedule: 'every 24 hours',
  region: REGION,
  timeZone: 'America/Chicago',
  memory: '256MiB',
  timeoutSeconds: 540,
  maxInstances: 1,
}, async () => {
  const now = Date.now();
  const due = await db.collection('members')
    .where('status', '==', STATE.ACTIVE)
    .where('accessEnds', '<=', now)
    .limit(500)
    .get();
  let expired = 0;
  for (const member of due.docs) {
    await revokeStudent(member.id, { actorId: 'system:maintenance', reasonCode: 'expired' });
    expired += 1;
  }

  const anonymousCutoff = now - 7 * 86_400_000;
  let deletedAnonymous = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1_000, pageToken);
    for (const user of page.users) {
      if (!user.email && new Date(user.metadata.creationTime).getTime() < anonymousCutoff) {
        await auth.deleteUser(user.uid);
        deletedAnonymous += 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken && deletedAnonymous < 2_000);

  await writeAudit({
    type: 'maintenance.completed', targetType: 'system', targetId: 'daily',
    actorId: 'system:maintenance', reasonCode: `${expired}:${deletedAnonymous}`,
  });
});
