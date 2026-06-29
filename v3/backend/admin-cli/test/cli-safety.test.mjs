import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cwd = new URL('..', import.meta.url);
const baseEnv = { ...process.env };
delete baseEnv.FIRESTORE_EMULATOR_HOST;
delete baseEnv.FIREBASE_AUTH_EMULATOR_HOST;

function importAdmin(extraEnv) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', "await import('./lib/admin.mjs')"], {
    cwd,
    env: { ...baseEnv, ...extraEnv },
    encoding: 'utf8',
  });
}

test('partial emulator configuration fails closed before Admin SDK initialization', () => {
  for (const extraEnv of [
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
  ]) {
    const result = importAdmin(extraEnv);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing partial emulator configuration/);
  }
});

test('non-loopback emulator hosts fail closed', () => {
  const result = importAdmin({
    FIRESTORE_EMULATOR_HOST: 'firebase.internal:8080',
    FIREBASE_AUTH_EMULATOR_HOST: 'firebase.internal:9099',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing non-loopback emulator hosts/);
});
