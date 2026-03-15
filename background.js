/* global OTPAuth */

// background worker for github sync
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'githubSync') {
    handleGithubSync(request.data).then(sendResponse);
    return true; // keep channel open
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
    return { success: false, error: 'GitHub not configured' };
  }

  const userEmail = await getUserInfo();
  // we save each profile in its own file under a profiles directory
  const fileName = `profiles/${userEmail.replace(/[@.]/g, '_')}.json`;
  const url = `https://api.github.com/repos/${ghRepo}/contents/${fileName}`;
  
  try {
    // 1. get existing file sha if it exists
    let sha;
    const getRes = await fetch(url, {
      headers: { 'Authorization': `token ${ghToken}` }
    });
    
    if (getRes.status === 200) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    // 2. upload/update file with profile metadata
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
      return { success: false, error: err.message };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}
