/* global VaultSync */

importScripts('lib/vaultSync.js');

const GITHUB_API_ROOT = 'https://api.github.com';
const VAULT_PATH = 'profiles/common.json';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_SYNC_ATTEMPTS = 3;
const MAX_VAULT_BYTES = 900000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ success: false, error: 'Request rejected' });
    return false;
  }

  const action = request && request.action;
  let operation;

  if (action === 'vault:sync' || action === 'githubSync') {
    const payload = action === 'githubSync'
      ? { accounts: request.data, deletions: [] }
      : request.payload;
    operation = syncVault(payload);
  } else if (action === 'vault:fetch') {
    operation = fetchVaultProfiles();
  } else if (action === 'vault:identity') {
    operation = getProfileIdentity().then((profile) => ({ success: true, profile }));
  } else {
    return false;
  }

  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: humanizeError(error) }));
  return true;
});

function isTrustedSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  if (!sender.url) return true;
  return sender.url.startsWith(chrome.runtime.getURL(''));
}

async function getProfileIdentity() {
  const email = await new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
      if (chrome.runtime.lastError) {
        resolve('');
        return;
      }
      resolve((userInfo && userInfo.email ? userInfo.email : '').trim().toLowerCase());
    });
  });

  if (email) return email;

  const stored = await chrome.storage.local.get('localProfileId');
  if (stored.localProfileId) return stored.localProfileId;

  const generated = `local-${VaultSync.createAccountId().replace(/^acct-/, '').slice(0, 18)}`;
  await chrome.storage.local.set({ localProfileId: generated });
  return generated;
}

async function getGithubConfig() {
  const stored = await chrome.storage.local.get(['ghToken', 'ghRepo']);
  const storedToken = typeof stored.ghToken === 'string' ? stored.ghToken.trim() : '';
  const token = /^[A-Za-z0-9_]{20,512}$/.test(storedToken) ? storedToken : '';
  const repo = VaultSync.normalizeRepo(stored.ghRepo);

  if (!token || !repo) {
    throw new Error('CONFIG_MISSING');
  }

  return { token, repo };
}

function githubContentsUrl(repo) {
  const [owner, name] = repo.split('/').map(encodeURIComponent);
  return `${GITHUB_API_ROOT}/repos/${owner}/${name}/contents/${VAULT_PATH}`;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeBase64(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function readRemoteVault(config) {
  const response = await fetchWithTimeout(githubContentsUrl(config.repo), {
    headers: githubHeaders(config.token),
    cache: 'no-store'
  });

  if (response.status === 404) {
    return { sha: '', payload: VaultSync.parseVaultPayload({ accounts: [] }) };
  }

  if (!response.ok) throw await githubError(response);

  const file = await response.json();
  if (!file || typeof file.content !== 'string') throw new Error('VAULT_INVALID');

  try {
    const parsed = JSON.parse(decodeBase64(file.content));
    return { sha: file.sha || '', payload: VaultSync.parseVaultPayload(parsed) };
  } catch (error) {
    throw new Error('VAULT_INVALID');
  }
}

async function writeRemoteVault(config, sha, accounts) {
  const payload = {
    schemaVersion: VaultSync.SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    accounts
  };
  const serialized = JSON.stringify(payload, null, 2);

  if (new TextEncoder().encode(serialized).byteLength > MAX_VAULT_BYTES) {
    throw new Error('VAULT_TOO_LARGE');
  }

  const body = {
    message: 'Sync authenticator vault',
    content: encodeBase64(serialized)
  };
  if (sha) body.sha = sha;

  return fetchWithTimeout(githubContentsUrl(config.repo), {
    method: 'PUT',
    headers: {
      ...githubHeaders(config.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function syncVault(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const accounts = VaultSync.sanitizeAccounts(payload.accounts);
  const deletions = VaultSync.normalizeDeletions(payload.deletions);
  const config = await getGithubConfig();
  const profile = await getProfileIdentity();

  let lastConflict = false;

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
    const remote = await readRemoteVault(config);
    const merged = VaultSync.mergeVault(accounts, remote.payload.accounts, profile, deletions);
    const remoteChanged = VaultSync.vaultFingerprint(merged.commonAccounts)
      !== VaultSync.vaultFingerprint(remote.payload.accounts);

    if (!remoteChanged) {
      return syncResult(merged, profile, false);
    }

    const response = await writeRemoteVault(config, remote.sha, merged.commonAccounts);

    if (response.status === 409 || response.status === 422) {
      lastConflict = true;
      continue;
    }

    if (!response.ok) throw await githubError(response);

    return syncResult(merged, profile, true);
  }

  if (lastConflict) throw new Error('SYNC_CONFLICT');
  throw new Error('SYNC_FAILED');
}

function syncResult(merged, profile, wroteRemote) {
  return {
    success: true,
    profile,
    mergedAccounts: merged.localAccounts,
    profiles: VaultSync.buildProfiles(merged.commonAccounts),
    pulled: merged.pulled,
    pushed: merged.pushed,
    deleted: merged.deleted,
    wroteRemote,
    syncedAt: new Date().toISOString()
  };
}

async function fetchVaultProfiles() {
  const config = await getGithubConfig();
  const remote = await readRemoteVault(config);
  const profile = await getProfileIdentity();

  return {
    success: true,
    profile,
    profiles: VaultSync.buildProfiles(remote.payload.accounts),
    updatedAt: remote.payload.updatedAt
  };
}

async function githubError(response) {
  let message = '';
  try {
    const body = await response.json();
    message = typeof body.message === 'string' ? body.message : '';
  } catch (error) {
    message = '';
  }

  const failure = new Error(`GITHUB_${response.status}`);
  failure.status = response.status;
  failure.githubMessage = message;
  return failure;
}

function humanizeError(error) {
  const code = error && error.name === 'AbortError' ? 'TIMEOUT' : error && error.message;

  if (code === 'CONFIG_MISSING') return 'Cloud vault is not configured';
  if (code === 'VAULT_INVALID') return 'The cloud vault file is not valid JSON';
  if (code === 'VAULT_TOO_LARGE') return 'The cloud vault is too large to sync';
  if (code === 'SYNC_CONFLICT') return 'The vault changed repeatedly. Sync again in a moment';
  if (code === 'TIMEOUT') return 'GitHub did not respond in time';
  if (code === 'GITHUB_401') return 'The GitHub token is invalid or expired';
  if (code === 'GITHUB_403') return 'GitHub denied access. Check token permissions and rate limits';
  if (code === 'GITHUB_404') return 'Repository not found or the token cannot access it';
  if (code === 'GITHUB_413') return 'The cloud vault is too large to sync';
  if (code === 'GITHUB_429') return 'GitHub rate limit reached. Try again later';
  if (code && code.startsWith('GITHUB_')) return 'GitHub could not complete the request';
  if (typeof code === 'string' && /Failed to fetch|NetworkError/i.test(code)) return 'Network connection failed';
  return 'Cloud sync failed';
}
