const test = require('node:test');
const assert = require('node:assert/strict');
const VaultSync = require('../lib/vaultSync.js');

const NOW = 1788200000000;
const SECRET_A = 'JBSWY3DPEHPK3PXP';
const SECRET_B = 'KRUGS4ZANFZSAYJA';

function account(secret, overrides = {}) {
  return {
    id: overrides.id || `id-${secret.slice(0, 4)}`,
    secret,
    issuer: 'Example',
    label: 'user@example.com',
    createdAt: NOW - 1000,
    updatedAt: NOW - 500,
    ...overrides
  };
}

test('normalizes GitHub repository inputs and rejects ambiguous paths', () => {
  assert.equal(VaultSync.normalizeRepo('https://github.com/example/private-vault.git'), 'example/private-vault');
  assert.equal(VaultSync.normalizeRepo(' example/private-vault/ '), 'example/private-vault');
  assert.equal(VaultSync.normalizeRepo('example/private-vault/extra'), '');
  assert.equal(VaultSync.normalizeRepo('example'), '');
});

test('normalizes Base32 secrets without exposing formatting differences', () => {
  assert.equal(VaultSync.normalizeSecret('jbsw y3dp-ehpk3pxp==='), SECRET_A);
  assert.equal(VaultSync.accountKey({ secret: 'jbsw y3dp ehpk3pxp' }), SECRET_A);
  assert.equal(VaultSync.isValidSecret(SECRET_A), true);
  assert.equal(VaultSync.isValidSecret('invalid0secret'), false);
});

test('pulls cloud accounts on a fresh install instead of treating absence as deletion', () => {
  const remote = [account(SECRET_A, { profiles: ['person@example.com'] })];
  const result = VaultSync.mergeVault([], remote, 'person@example.com', [], { now: NOW });

  assert.equal(result.pulled, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.localAccounts.length, 1);
  assert.equal(result.commonAccounts.length, 1);
});

test('applies an explicit tombstone without deleting another profile copy', () => {
  const remote = [account(SECRET_A, { profiles: ['person@example.com', 'work@example.com'] })];
  const result = VaultSync.mergeVault(
    [],
    remote,
    'person@example.com',
    [{ key: SECRET_A, deletedAt: NOW }],
    { now: NOW }
  );

  assert.equal(result.deleted, 1);
  assert.equal(result.localAccounts.length, 0);
  assert.deepEqual(result.commonAccounts[0].profiles, ['work@example.com']);
});

test('pushes new local accounts and retains unrelated remote accounts', () => {
  const local = [account(SECRET_A)];
  const remote = [account(SECRET_B, { profiles: ['work@example.com'] })];
  const result = VaultSync.mergeVault(local, remote, 'person@example.com', [], { now: NOW });

  assert.equal(result.pushed, 1);
  assert.equal(result.commonAccounts.length, 2);
  assert.equal(result.localAccounts.length, 1);
  assert.ok(result.commonAccounts.some((item) => item.secret === SECRET_B));
});

test('prefers newer metadata while preserving aggregate usage fields', () => {
  const local = [account(SECRET_A, {
    label: 'new label',
    updatedAt: NOW,
    lastUsed: NOW,
    useCount: 7
  })];
  const remote = [account(SECRET_A, {
    label: 'old label',
    updatedAt: NOW - 1000,
    lastUsed: NOW - 2000,
    useCount: 3,
    profiles: ['person@example.com']
  })];
  const result = VaultSync.mergeVault(local, remote, 'person@example.com', [], { now: NOW });

  assert.equal(result.localAccounts[0].label, 'new label');
  assert.equal(result.localAccounts[0].useCount, 7);
  assert.equal(result.localAccounts[0].lastUsed, NOW);
});

test('sanitizes duplicate and malformed remote entries', () => {
  const result = VaultSync.sanitizeAccounts([
    account(SECRET_A, { profiles: ['a@example.com'] }),
    account(` ${SECRET_A.toLowerCase()} `, { profiles: ['b@example.com'], updatedAt: NOW }),
    account('INVALID')
  ], { includeProfiles: true, now: NOW });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].profiles, ['a@example.com', 'b@example.com']);
});

test('does not manufacture profile data for local duplicate accounts', () => {
  const result = VaultSync.sanitizeAccounts([
    account(SECRET_A),
    account(SECRET_A, { updatedAt: NOW })
  ], { now: NOW });

  assert.equal(Object.hasOwn(result[0], 'profiles'), false);
});

test('keeps an unchanged account timestamp stable across syncs', () => {
  const remote = [account(SECRET_A, { profiles: ['person@example.com'] })];
  const local = [account(SECRET_A)];
  const result = VaultSync.mergeVault(local, remote, 'person@example.com', [], { now: NOW });

  assert.equal(result.commonAccounts[0].updatedAt, NOW - 500);
});

test('vault fingerprints are stable across account and profile ordering', () => {
  const first = [
    account(SECRET_A, { profiles: ['work@example.com', 'person@example.com'] }),
    account(SECRET_B, { profiles: ['person@example.com'] })
  ];
  const second = [
    account(SECRET_B, { profiles: ['person@example.com'] }),
    account(SECRET_A, { profiles: ['person@example.com', 'work@example.com'] })
  ];

  assert.equal(VaultSync.vaultFingerprint(first), VaultSync.vaultFingerprint(second));
});

test('does not let a stale deletion erase a newer remote update', () => {
  const remote = [account(SECRET_A, {
    updatedAt: NOW,
    profiles: ['person@example.com']
  })];
  const result = VaultSync.mergeVault(
    [],
    remote,
    'person@example.com',
    [{ key: SECRET_A, deletedAt: NOW - 1000 }],
    { now: NOW + 1000 }
  );

  assert.equal(result.deleted, 0);
  assert.equal(result.pulled, 1);
  assert.equal(result.localAccounts.length, 1);
});

test('drops an OTP URI when its embedded secret does not match the account', () => {
  const result = VaultSync.normalizeAccount(account(SECRET_A, {
    uri: `otpauth://totp/Example:user?secret=${SECRET_B}&issuer=Example`
  }), { now: NOW });

  assert.equal(result.uri, '');
});

test('retains valid bounded TOTP and HOTP parameters', () => {
  const totpUri = `otpauth://totp/Example:user?secret=${SECRET_A}&issuer=Example&algorithm=SHA256&digits=8&period=60`;
  const hotpUri = `otpauth://hotp/Example:user?secret=${SECRET_B}&issuer=Example&algorithm=SHA1&digits=6&counter=42`;

  assert.equal(VaultSync.normalizeOtpUri(totpUri, SECRET_A), totpUri);
  assert.equal(VaultSync.normalizeOtpUri(hotpUri, SECRET_B), hotpUri);
});

test('canonicalizes case-insensitive OTP parameters before storage', () => {
  const result = VaultSync.normalizeOtpUri(
    `otpauth://totp/Example:user?SECRET=${SECRET_A.toLowerCase()}&ALGORITHM=SHA-256&DIGITS=8&period=60`,
    SECRET_A
  );
  const parsed = new URL(result);

  assert.equal(parsed.searchParams.get('secret'), SECRET_A);
  assert.equal(parsed.searchParams.get('algorithm'), 'SHA256');
  assert.equal(parsed.searchParams.get('digits'), '8');
  assert.equal(parsed.searchParams.has('SECRET'), false);
});

test('repairs duplicate account identifiers during sanitization', () => {
  const result = VaultSync.sanitizeAccounts([
    account(SECRET_A, { id: 'duplicate-id' }),
    account(SECRET_B, { id: 'duplicate-id' })
  ], { now: NOW });

  assert.equal(result.length, 2);
  assert.notEqual(result[0].id, result[1].id);
});

test('replaces out-of-range timestamps before they reach date formatting', () => {
  const result = VaultSync.normalizeAccount(account(SECRET_A, {
    createdAt: Number.MAX_VALUE,
    updatedAt: Number.MAX_VALUE,
    lastUsed: Number.MAX_VALUE
  }), { now: NOW });

  assert.equal(result.createdAt, NOW);
  assert.equal(result.updatedAt, NOW);
  assert.equal(result.lastUsed, 0);
});

test('sanitizes and combines stored cloud profile groups', () => {
  const profiles = VaultSync.sanitizeProfileGroups([
    { email: ' Person@Example.com ', accounts: [account(SECRET_A)] },
    { email: 'person@example.com', accounts: [account(SECRET_B)] },
    { email: '', accounts: [account(SECRET_A)] }
  ]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].email, 'person@example.com');
  assert.equal(profiles[0].accounts.length, 2);
});
