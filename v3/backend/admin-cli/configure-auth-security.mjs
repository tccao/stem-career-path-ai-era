// One-time Identity Platform hardening. Requires the explicit production break-glass gate.
import { auth, requireBreakGlass } from './lib/admin.mjs';

requireBreakGlass();
try {
  const config = await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      state: 'ENABLED',
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
    },
    emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
  });
  console.log(JSON.stringify({
    mfaState: config.multiFactorConfig?.state,
    improvedEmailPrivacy: config.emailPrivacyConfig?.enableImprovedEmailPrivacy,
  }));
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'auth/configuration-failed';
  const message = typeof error?.message === 'string' ? error.message : 'Identity Platform configuration failed';
  console.error(`error: ${code}: ${message}`);
  process.exit(1);
}
