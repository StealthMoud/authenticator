(function attachVaultSync(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.VaultSync = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function createVaultSync() {
  'use strict';

  const SCHEMA_VERSION = 2;
  const MAX_ACCOUNTS = 2000;
  const MAX_TEXT_LENGTH = 180;
  const MAX_TIMESTAMP = 8640000000000000;
  const BASE32_PATTERN = /^[A-Z2-7]{8,256}$/;
  const PROFILE_SPLIT_PATTERN = /\s*,\s*/;
  let fallbackIdCounter = 0;

  function cleanText(value, fallback = '', maxLength = MAX_TEXT_LENGTH) {
    if (typeof value !== 'string') return fallback;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return clean ? clean.slice(0, maxLength) : fallback;
  }

  function normalizeSecret(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\s-]/g, '').replace(/=+$/g, '').toUpperCase();
  }

  function isValidSecret(value) {
    return BASE32_PATTERN.test(normalizeSecret(value));
  }

  function normalizeRepo(value) {
    if (typeof value !== 'string') return '';

    let repo = value.trim();
    repo = repo.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '');
    repo = repo.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');

    const parts = repo.split('/');
    if (parts.length !== 2) return '';
    if (!parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..')) {
      return '';
    }

    return `${parts[0]}/${parts[1]}`;
  }

  function normalizeTimestamp(value, fallback = 0) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) return fallback;
    return Math.floor(timestamp);
  }

  function normalizeOtpUri(value, secret) {
    if (typeof value !== 'string' || value.length > 4096 || !/^otpauth:\/\/(?:totp|hotp)\//i.test(value)) return '';

    try {
      const parsed = new URL(value);
      const type = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'otpauth:' || !['totp', 'hotp'].includes(type)) return '';

      const params = new Map();
      parsed.searchParams.forEach((parameterValue, parameterName) => {
        params.set(parameterName.toLowerCase(), parameterValue);
      });
      if (normalizeSecret(params.get('secret')) !== secret) return '';

      const algorithm = cleanText(params.get('algorithm'), 'SHA1', 16)
        .toUpperCase()
        .replace(/^SHA-(?=\d+$)/, 'SHA');
      const allowedAlgorithms = new Set([
        'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512',
        'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512'
      ]);
      if (!allowedAlgorithms.has(algorithm)) return '';

      const digits = Number(params.get('digits') || 6);
      if (!Number.isInteger(digits) || digits < 6 || digits > 10) return '';

      if (type === 'totp') {
        const period = Number(params.get('period') || 30);
        if (!Number.isInteger(period) || period < 1 || period > 3600) return '';
        parsed.searchParams.set('period', String(period));
      } else {
        const counter = Number(params.get('counter'));
        if (!Number.isSafeInteger(counter) || counter < 0) return '';
        parsed.searchParams.set('counter', String(counter));
      }

      Array.from(parsed.searchParams.keys()).forEach((name) => {
        const lowerName = name.toLowerCase();
        if (['secret', 'algorithm', 'digits', 'period', 'counter'].includes(lowerName) && name !== lowerName) {
          parsed.searchParams.delete(name);
        }
      });
      parsed.searchParams.set('secret', secret);
      parsed.searchParams.set('algorithm', algorithm);
      parsed.searchParams.set('digits', String(digits));
      return parsed.toString().slice(0, 4096);
    } catch (error) {
      return '';
    }
  }

  function createAccountId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      const randomPart = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `acct-${randomPart}`;
    }

    fallbackIdCounter += 1;
    return `acct-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
  }

  function normalizeProfiles(value) {
    const input = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(PROFILE_SPLIT_PATTERN)
        : [];

    return Array.from(new Set(input
      .map((profile) => cleanText(profile, '', 254).toLowerCase())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function normalizeAccount(account, options = {}) {
    if (!account || typeof account !== 'object') return null;

    const now = normalizeTimestamp(options.now, Date.now());
    const secret = normalizeSecret(account.secret);
    if (!isValidSecret(secret)) return null;

    const createdAt = normalizeTimestamp(account.createdAt, now);
    const updatedAt = normalizeTimestamp(account.updatedAt, createdAt || now);
    const idValue = typeof account.id === 'string' || typeof account.id === 'number'
      ? cleanText(String(account.id), '', 180)
      : '';
    const uri = normalizeOtpUri(account.uri, secret);

    const normalized = {
      id: idValue || createAccountId(),
      secret,
      issuer: cleanText(account.issuer, 'Unknown'),
      label: cleanText(account.label, 'Account'),
      uri,
      lastUsed: normalizeTimestamp(account.lastUsed, 0),
      useCount: Math.max(0, Math.floor(normalizeTimestamp(account.useCount, 0))),
      createdAt: createdAt || now,
      updatedAt: updatedAt || createdAt || now
    };

    if (options.includeProfiles) {
      normalized.profiles = normalizeProfiles(account.profiles || account.profile);
    }

    return normalized;
  }

  function accountKey(accountOrSecret) {
    if (typeof accountOrSecret === 'string') return normalizeSecret(accountOrSecret);
    return normalizeSecret(accountOrSecret && accountOrSecret.secret);
  }

  function mergeDuplicateAccounts(existing, incoming) {
    const existingUpdated = normalizeTimestamp(existing.updatedAt, existing.createdAt);
    const incomingUpdated = normalizeTimestamp(incoming.updatedAt, incoming.createdAt);
    const preferred = incomingUpdated >= existingUpdated ? incoming : existing;
    const other = preferred === incoming ? existing : incoming;
    const createdCandidates = [existing.createdAt, incoming.createdAt].filter((value) => value > 0);

    const merged = {
      ...other,
      ...preferred,
      id: existing.id || incoming.id,
      secret: existing.secret || incoming.secret,
      createdAt: createdCandidates.length ? Math.min(...createdCandidates) : Date.now(),
      updatedAt: Math.max(existingUpdated, incomingUpdated),
      lastUsed: Math.max(existing.lastUsed || 0, incoming.lastUsed || 0),
      useCount: Math.max(existing.useCount || 0, incoming.useCount || 0)
    };

    if (Object.hasOwn(existing, 'profiles') || Object.hasOwn(incoming, 'profiles')) {
      merged.profiles = normalizeProfiles([...(existing.profiles || []), ...(incoming.profiles || [])]);
    } else {
      delete merged.profiles;
    }

    return merged;
  }

  function sanitizeAccounts(accounts, options = {}) {
    if (!Array.isArray(accounts)) return [];

    const byKey = new Map();
    accounts.slice(0, MAX_ACCOUNTS).forEach((account) => {
      const normalized = normalizeAccount(account, options);
      if (!normalized) return;

      const key = accountKey(normalized);
      if (byKey.has(key)) {
        byKey.set(key, mergeDuplicateAccounts(byKey.get(key), normalized));
      } else {
        byKey.set(key, normalized);
      }
    });

    const usedIds = new Set();
    return Array.from(byKey.values()).map((account) => {
      if (!usedIds.has(account.id)) {
        usedIds.add(account.id);
        return account;
      }

      const uniqueAccount = { ...account, id: createAccountId() };
      usedIds.add(uniqueAccount.id);
      return uniqueAccount;
    });
  }

  function normalizeDeletions(deletions) {
    if (!Array.isArray(deletions)) return [];

    const byKey = new Map();
    deletions.forEach((deletion) => {
      const rawKey = typeof deletion === 'string' ? deletion : deletion && (deletion.key || deletion.secret);
      const key = normalizeSecret(rawKey);
      if (!isValidSecret(key)) return;
      const deletedAt = normalizeTimestamp(deletion && deletion.deletedAt, Date.now());
      const existing = byKey.get(key);
      if (!existing || deletedAt > existing.deletedAt) {
        byKey.set(key, { key, deletedAt });
      }
    });

    return Array.from(byKey.values());
  }

  function mergeAccountFields(remoteAccount, localAccount, profileId, now) {
    const remoteUpdated = normalizeTimestamp(remoteAccount.updatedAt, remoteAccount.createdAt);
    const localUpdated = normalizeTimestamp(localAccount.updatedAt, localAccount.createdAt);
    const preferred = localUpdated >= remoteUpdated ? localAccount : remoteAccount;
    const other = preferred === localAccount ? remoteAccount : localAccount;
    const createdCandidates = [remoteAccount.createdAt, localAccount.createdAt].filter((value) => value > 0);
    const membershipChanged = !remoteAccount.profiles.includes(profileId);

    return {
      ...other,
      ...preferred,
      id: remoteAccount.id || localAccount.id,
      secret: localAccount.secret,
      createdAt: createdCandidates.length ? Math.min(...createdCandidates) : now,
      updatedAt: membershipChanged
        ? Math.max(remoteUpdated, localUpdated, now)
        : Math.max(remoteUpdated, localUpdated),
      lastUsed: Math.max(remoteAccount.lastUsed || 0, localAccount.lastUsed || 0),
      useCount: Math.max(remoteAccount.useCount || 0, localAccount.useCount || 0),
      profiles: normalizeProfiles([...(remoteAccount.profiles || []), profileId])
    };
  }

  function toLocalAccount(account) {
    const { profiles = [], ...local } = account;
    return {
      ...local,
      profile: normalizeProfiles(profiles).join(', ')
    };
  }

  function mergeVault(localAccounts, remoteAccounts, rawProfileId, rawDeletions = [], options = {}) {
    const now = normalizeTimestamp(options.now, Date.now());
    const profileId = cleanText(rawProfileId, '', 254).toLowerCase();
    if (!profileId) throw new TypeError('A profile identifier is required');

    const local = sanitizeAccounts(localAccounts, { now, includeProfiles: false });
    const remote = sanitizeAccounts(remoteAccounts, { now, includeProfiles: true });
    const deletions = normalizeDeletions(rawDeletions);
    const localByKey = new Map(local.map((account) => [accountKey(account), account]));
    const remoteByKey = new Map(remote.map((account) => [accountKey(account), account]));
    const deletionsByKey = new Map(deletions.map((deletion) => [deletion.key, deletion]));

    let pulled = 0;
    let pushed = 0;
    let deleted = 0;

    localByKey.forEach((localAccount, key) => {
      const remoteAccount = remoteByKey.get(key);
      if (!remoteAccount) {
        pushed += 1;
        remoteByKey.set(key, {
          ...localAccount,
          updatedAt: Math.max(localAccount.updatedAt || 0, now),
          profiles: [profileId]
        });
        return;
      }

      if (!remoteAccount.profiles.includes(profileId)) pushed += 1;
      remoteByKey.set(key, mergeAccountFields(remoteAccount, localAccount, profileId, now));
    });

    remoteByKey.forEach((remoteAccount, key) => {
      const hasLocal = localByKey.has(key);
      const belongsToProfile = remoteAccount.profiles.includes(profileId);

      const deletion = deletionsByKey.get(key);
      const remoteUpdated = normalizeTimestamp(remoteAccount.updatedAt, remoteAccount.createdAt);
      const deletionWins = deletion && deletion.deletedAt >= remoteUpdated;

      if (!hasLocal && belongsToProfile && deletionWins) {
        const remainingProfiles = remoteAccount.profiles.filter((profile) => profile !== profileId);
        deleted += 1;
        if (remainingProfiles.length === 0) {
          remoteByKey.delete(key);
        } else {
          remoteByKey.set(key, { ...remoteAccount, profiles: remainingProfiles, updatedAt: now });
        }
        return;
      }

      if (!hasLocal && belongsToProfile) pulled += 1;
    });

    const commonAccounts = Array.from(remoteByKey.values())
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const mergedLocalAccounts = commonAccounts
      .filter((account) => account.profiles.includes(profileId))
      .map(toLocalAccount);

    return {
      commonAccounts,
      localAccounts: mergedLocalAccounts,
      pulled,
      pushed,
      deleted
    };
  }

  function buildProfiles(accounts) {
    const profiles = new Map();
    sanitizeAccounts(accounts, { includeProfiles: true }).forEach((account) => {
      account.profiles.forEach((profileId) => {
        if (!profiles.has(profileId)) {
          profiles.set(profileId, { email: profileId, accounts: [] });
        }
        profiles.get(profileId).accounts.push(toLocalAccount(account));
      });
    });

    return Array.from(profiles.values())
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  function sanitizeProfileGroups(profileGroups) {
    if (!Array.isArray(profileGroups)) return [];

    const byProfile = new Map();
    profileGroups.slice(0, 200).forEach((profile) => {
      if (!profile || typeof profile !== 'object') return;
      const profileId = normalizeProfiles([profile.email])[0];
      if (!profileId) return;
      const existing = byProfile.get(profileId) || [];
      byProfile.set(profileId, sanitizeAccounts([
        ...existing,
        ...(Array.isArray(profile.accounts) ? profile.accounts : [])
      ]));
    });

    return Array.from(byProfile.entries())
      .map(([email, accounts]) => ({ email, accounts }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  function vaultFingerprint(accounts) {
    const normalized = sanitizeAccounts(accounts, { includeProfiles: true })
      .sort((a, b) => accountKey(a).localeCompare(accountKey(b)));
    return JSON.stringify(normalized);
  }

  function parseVaultPayload(value) {
    const payload = value && typeof value === 'object' ? value : {};
    return {
      schemaVersion: Number.isInteger(payload.schemaVersion) ? payload.schemaVersion : 1,
      updatedAt: cleanText(payload.updatedAt, '', 64),
      accounts: sanitizeAccounts(payload.accounts, { includeProfiles: true })
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    MAX_ACCOUNTS,
    accountKey,
    buildProfiles,
    createAccountId,
    isValidSecret,
    mergeVault,
    normalizeAccount,
    normalizeDeletions,
    normalizeOtpUri,
    normalizeProfiles,
    normalizeRepo,
    normalizeSecret,
    parseVaultPayload,
    sanitizeAccounts,
    sanitizeProfileGroups,
    toLocalAccount,
    vaultFingerprint
  });
});
