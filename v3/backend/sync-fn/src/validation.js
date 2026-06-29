import { HttpsError } from 'firebase-functions/v2/https';

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
    throw new HttpsError('invalid-argument', detail.slice(0, 500));
  }
  return result.data;
}
export function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}
