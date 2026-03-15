/* global OTPAuth */

// background worker for github sync
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'githubSync') {
    handleGithubSync(request.data).then(sendResponse);
    return true; // keep channel open
  }
});

async function handleGithubSync(data) {
  // we use a personal access token for simlicity as requested for "backing up"
  // in a real prod app we'd use oauth2 but this is faster for personal use
  const { ghToken, ghRepo, ghPath } = await chrome.storage.local.get(['ghToken', 'ghRepo', 'ghPath']);
  
  if (!ghToken || !ghRepo) {
    return { success: false, error: 'GitHub not configured' };
  }

  const path = ghPath || 'authenticator_backup.json';
  const url = `https://api.github.com/repos/${ghRepo}/contents/${path}`;
  
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

    // 2. upload/update file
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'vault sync',
        content: btoa(JSON.stringify(data, null, 2)),
        sha: sha
      })
    });

    if (putRes.ok) {
      return { success: true };
    } else {
      const err = await putRes.json();
      return { success: false, error: err.message };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}
