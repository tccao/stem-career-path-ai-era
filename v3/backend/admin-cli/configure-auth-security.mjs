// One-time Identity Platform hardening. Requires the explicit production break-glass gate.
import { auth, requireBreakGlass } from './lib/admin.mjs';

requireBreakGlass();
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
