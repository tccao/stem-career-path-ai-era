// Supporter self-serve (POST-MVP on Spark). The applicant applies with accessChoice
// 'supporter' (apply.js) and pays on Zeffy (hosted, off-stack). Verification + grant are
// done server-side by the admin-cli (confirm-donation → grant.mjs --basis supporter), because
// the Functions-free Spark backend has no hosted endpoint to verify a payment at runtime.
// This module is a placeholder for the Zeffy redirect link.
export const ZEFFY_DONATE_URL = 'https://www.zeffy.com/'; // TODO: real campaign URL

export function goDonate() { location.href = ZEFFY_DONATE_URL; }
