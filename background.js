/* global OTPAuth */

// background worker for github sync operations
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'githubSync') {
    handleGithubSync(request.data).then(sendResponse);
    return true; // keep the message channel open for async
  }
});

async function getUserInfo() {
  return new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
      resolve(userInfo.email || 'offline-profile');
    });
  });
}

function mergeGlobalVault(local, remote, userEmail) {
  const map = new Map();
  let pulled = 0;
  let pushed = 0;
  
  // Index remote accounts by secret
  if (Array.isArray(remote)) {
    remote.forEach(acc => {
      if (acc && acc.secret) {
        const cleanSecret = acc.secret.replace(/\s/g, '').toUpperCase();
        map.set(cleanSecret, { ...acc, profiles: acc.profiles || [] });
      }
    });
  }
  
  const localSecrets = new Set();
  if (Array.isArray(local)) {
    local.forEach(acc => {
      if (acc && acc.secret) {
        const cleanSecret = acc.secret.replace(/\s/g, '').toUpperCase();
        localSecrets.add(cleanSecret);
        
        const existing = map.get(cleanSecret);
        if (!existing) {
          // local-only account, pushed to remote
          pushed++;
          map.set(cleanSecret, {
            id: acc.id || Date.now() + Math.random(),
            secret: acc.secret,
            issuer: acc.issuer,
            label: acc.label,
            uri: acc.uri,
            lastUsed: acc.lastUsed || 0,
            useCount: acc.useCount || 0,
            createdAt: acc.createdAt || Date.now(),
            profiles: [userEmail]
          });
        } else {
          // existing account, merge details and profiles
          const merged = { ...existing };
          merged.id = existing.id || acc.id || Date.now() + Math.random();
          merged.lastUsed = Math.max(existing.lastUsed || 0, acc.lastUsed || 0);
          merged.useCount = Math.max(existing.useCount || 0, acc.useCount || 0);
          merged.createdAt = Math.min(existing.createdAt || Infinity, acc.createdAt || Infinity) || Date.now();
          merged.label = acc.label || existing.label;
          merged.issuer = acc.issuer || existing.issuer;
          merged.uri = acc.uri || existing.uri;
          if (!merged.profiles.includes(userEmail)) {
            merged.profiles.push(userEmail);
          }
          map.set(cleanSecret, merged);
        }
      }
    });
  }
  
  // If remote account has userEmail in profiles, but NOT in local, user deleted it locally
  map.forEach((acc, cleanSecret) => {
    if (acc.profiles.includes(userEmail) && !localSecrets.has(cleanSecret)) {
      acc.profiles = acc.profiles.filter(email => email !== userEmail);
      if (acc.profiles.length === 0) {
        map.delete(cleanSecret);
      }
    }
  });

  // Count pulled accounts
  if (Array.isArray(remote)) {
    remote.forEach(acc => {
      if (acc && acc.secret) {
        const cleanSecret = acc.secret.replace(/\s/g, '').toUpperCase();
        if (acc.profiles && acc.profiles.includes(userEmail) && !localSecrets.has(cleanSecret)) {
          pulled++;
        }
      }
    });
  }

  const allAccounts = Array.from(map.values());
  const localClientAccounts = allAccounts
    .filter(acc => acc.profiles.includes(userEmail))
    .map(acc => ({
      id: acc.id || Date.now() + Math.random(),
      secret: acc.secret,
      issuer: acc.issuer,
      label: acc.label,
      uri: acc.uri,
      lastUsed: acc.lastUsed || 0,
      useCount: acc.useCount || 0,
      createdAt: acc.createdAt || 0,
      profile: acc.profiles.join(', ')
    }));

  return { commonAccounts: allAccounts, localAccounts: localClientAccounts, pulled, pushed };
}

function decodeBase64(str) {
  try {
    return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
  } catch (e) {
    return atob(str.replace(/\s/g, ''));
  }
}

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function handleGithubSync(data) {
  const { ghToken, ghRepo } = await chrome.storage.local.get(['ghToken', 'ghRepo']);
  
  if (!ghToken || !ghRepo) {
    return { success: false, error: 'Cloud vault not configured' };
  }

  const userEmail = await getUserInfo();
  const fileName = 'profiles/common.json';
  const url = `https://api.github.com/repos/${ghRepo}/contents/${fileName}`;
  
  try {
    let sha;
    let remoteAccounts = [];
    const getRes = await fetch(url, {
      headers: { 'Authorization': `token ${ghToken}` }
    });
    
    if (getRes.status === 200) {
      const existing = await getRes.json();
      sha = existing.sha;
      try {
        const decoded = decodeBase64(existing.content);
        const parsed = JSON.parse(decoded);
        remoteAccounts = parsed.accounts || [];
      } catch (err) {
        console.error('Failed to parse remote accounts:', err);
      }
    } else if (getRes.status === 401) {
      return { success: false, error: 'Token expired or invalid' };
    } else if (getRes.status === 404) {
      // file doesn't exist yet, that's fine - first sync
    }

    // Bidirectional merge into common vault
    const mergeResult = mergeGlobalVault(data, remoteAccounts, userEmail);

    const profilePayload = {
      accounts: mergeResult.commonAccounts,
      updatedAt: new Date().toISOString()
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `vault sync for ${userEmail}`,
        content: encodeBase64(JSON.stringify(profilePayload, null, 2)),
        sha: sha
      })
    });

    if (putRes.ok) {
      return {
        success: true,
        profile: userEmail,
        mergedAccounts: mergeResult.localAccounts,
        pulled: mergeResult.pulled,
        pushed: mergeResult.pushed
      };
    } else {
      const err = await putRes.json();
      if (putRes.status === 401) return { success: false, error: 'Token expired or invalid' };
      if (putRes.status === 404) return { success: false, error: 'Repository not found — check the path' };
      if (putRes.status === 409) return { success: false, error: 'Conflict — try syncing again' };
      return { success: false, error: err.message || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message || 'Network error' };
  }
}
