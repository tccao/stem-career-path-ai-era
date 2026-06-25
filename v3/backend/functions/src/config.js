// Single home for tunable constants (audit fix — no scattered magic numbers).
export const ACCESS_DAYS = 90;            // default access window granted on approval/donation
export const CODE_TTL_MS = 7 * 86400_000; // magic-link validity (7 days)
export const SIGNED_URL_TTL_MS = 5 * 60_000; // gated-asset signed URL lifetime (5 min)
