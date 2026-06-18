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

function mergeVaults(local, remote) {
  const map = new Map();
  let pulled = 0;
  let pushed = 0;
  
  // index remote accounts first
  if (Array.isArray(remote)) {
    remote.forEach(acc => {
      if (acc && acc.secret) {
        map.set(acc.secret, acc);
      }
    });
  }
  
  const localSecrets = new Set();
  if (Array.isArray(local)) {
    local.forEach(acc => {
      if (acc && acc.secret) {
        localSecrets.add(acc.secret);
        const existing = map.get(acc.secret);
        if (!existing) {
          // local-only account, will be pushed to remote
          pushed++;
          map.set(acc.secret, acc);
        } else {
          const merged = { ...existing, ...acc };
          merged.lastUsed = Math.max(existing.lastUsed || 0, acc.lastUsed || 0);
          merged.label = acc.label || existing.label;
          merged.issuer = acc.issuer || existing.issuer;
          map.set(acc.secret, merged);
        }
      }
    });
  }
  
  // count remote-only accounts that local didn't have
  if (Array.isArray(remote)) {
    remote.forEach(acc => {
      if (acc && acc.secret && !localSecrets.has(acc.secret)) {
        pulled++;
      }
    });
  }
  
  return { accounts: Array.from(map.values()), pulled, pushed };
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
  // each Chrome profile gets its own file inside a profiles/ directory
  const fileName = `profiles/${userEmail.replace(/[@.]/g, '_')}.json`;
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

    // Bidirectional merge
    const mergeResult = mergeVaults(data, remoteAccounts);

    const profilePayload = {
      email: userEmail,
      updatedAt: new Date().toISOString(),
      accounts: mergeResult.accounts
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
        mergedAccounts: mergeResult.accounts,
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
