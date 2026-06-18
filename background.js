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
    // check if the file already exists to get its sha for updates
    let sha;
    const getRes = await fetch(url, {
      headers: { 'Authorization': `token ${ghToken}` }
    });
    
    if (getRes.status === 200) {
      const existing = await getRes.json();
      sha = existing.sha;
    } else if (getRes.status === 401) {
      return { success: false, error: 'Token expired or invalid' };
    } else if (getRes.status === 404) {
      // file doesn't exist yet, that's fine - first sync
    }

    // build profile payload with metadata
    const profilePayload = {
      email: userEmail,
      updatedAt: new Date().toISOString(),
      accounts: data
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `vault sync for ${userEmail}`,
        content: btoa(JSON.stringify(profilePayload, null, 2)),
        sha: sha
      })
    });

    if (putRes.ok) {
      return { success: true, profile: userEmail };
    } else {
      const err = await putRes.json();
      // provide clearer error messages for common failure modes
      if (putRes.status === 401) {
        return { success: false, error: 'Token expired or invalid' };
      }
      if (putRes.status === 404) {
        return { success: false, error: 'Repository not found — check the path' };
      }
      if (putRes.status === 409) {
        return { success: false, error: 'Conflict — try syncing again' };
      }
      return { success: false, error: err.message || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message || 'Network error' };
  }
}
