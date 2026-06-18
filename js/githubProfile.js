/* global AuthenticatorApp */

AuthenticatorApp.prototype.resolveProfileEmails = function() {
  if (!this.loadedProfiles || this.loadedProfiles.length === 0) return false;
  let modified = false;
  this.accounts.forEach(acc => {
    if (!acc.secret) return;
    const cleanSecret = acc.secret.replace(/\s/g, '').toUpperCase();
    const matchingProfiles = this.loadedProfiles
      .filter(p => p.accounts && p.accounts.some(remoteAcc => 
        remoteAcc.secret && remoteAcc.secret.replace(/\s/g, '').toUpperCase() === cleanSecret
      ))
      .map(p => p.email);
    
    if (matchingProfiles.length > 0) {
      const profileStr = matchingProfiles.join(', ');
      if (acc.profile !== profileStr) {
        acc.profile = profileStr;
        modified = true;
      }
    } else {
      if (acc.profile) {
        acc.profile = '';
        modified = true;
      }
    }
  });
  return modified;
};

AuthenticatorApp.prototype.silentFetchAndResolveProfiles = async function() {
  if (!this.ghToken || !this.ghRepo) return;
  const url = `https://api.github.com/repos/${this.ghRepo}/contents/profiles/common.json`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': `token ${this.ghToken}` } });
    if (res.ok) {
      const fileJson = await res.json();
      if (fileJson && fileJson.content) {
        const decoded = decodeURIComponent(escape(atob(fileJson.content.replace(/\s/g, ''))));
        const commonData = JSON.parse(decoded);
        const profileMap = new Map();
        if (commonData && Array.isArray(commonData.accounts)) {
          commonData.accounts.forEach(acc => {
            if (acc.profiles && Array.isArray(acc.profiles)) {
              acc.profiles.forEach(email => {
                if (!profileMap.has(email)) {
                  profileMap.set(email, { email, accounts: [] });
                }
                profileMap.get(email).accounts.push(acc);
              });
            }
          });
        }
        this.loadedProfiles = Array.from(profileMap.values());
        chrome.storage.local.set({ loadedProfiles: this.loadedProfiles });
        if (this.resolveProfileEmails()) {
          this.saveAccounts(true);
          this.render();
        }
      }
    }
  } catch (e) {
    console.error('Silent profile fetch failed:', e);
  }
};

AuthenticatorApp.prototype.fetchFromGithub = async function() {
  if (!this.ghToken || !this.ghRepo) {
    await this.loadGithubConfig();
  }
  if (!this.ghToken || !this.ghRepo) {
    this.showToast('Set up cloud vault in Settings first');
    return;
  }

  this.showToast('Fetching cloud profiles...');
  const url = `https://api.github.com/repos/${this.ghRepo}/contents/profiles/common.json`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': `token ${this.ghToken}` } });
    if (res.ok) {
      const fileJson = await res.json();
      if (fileJson && fileJson.content) {
        const decoded = decodeURIComponent(escape(atob(fileJson.content.replace(/\s/g, ''))));
        const commonData = JSON.parse(decoded);
        const profileMap = new Map();
        if (commonData && Array.isArray(commonData.accounts)) {
          commonData.accounts.forEach(acc => {
            if (acc.profiles && Array.isArray(acc.profiles)) {
              acc.profiles.forEach(email => {
                if (!profileMap.has(email)) {
                  profileMap.set(email, { email, accounts: [] });
                }
                profileMap.get(email).accounts.push(acc);
              });
            }
          });
        }
        this.loadedProfiles = Array.from(profileMap.values());
        chrome.storage.local.set({ loadedProfiles: this.loadedProfiles });
        if (this.resolveProfileEmails()) {
          this.saveAccounts(true);
          this.render();
        }
        if (this.loadedProfiles.length === 0) {
          this.showToast('No profiles found in cloud vault');
        } else {
          this.selectedProfileEmails.clear();
          this.selectedAccountSecrets.clear();
          if (this.cloudAccountsSearchInput) this.cloudAccountsSearchInput.value = '';
          if (this.cloudAccountsClearBtn) this.cloudAccountsClearBtn.classList.add('hidden');
          this.currentCloudAccounts = [];
          const previewContainer = document.getElementById('github-accounts-preview');
          if (previewContainer) previewContainer.classList.add('hidden');
          this.renderProfileSelection();
        }
      } else {
        this.showToast('No profiles found in cloud vault');
      }
    } else {
      this.showToast('No profiles found in cloud vault');
    }
  } catch (e) {
    this.showToast('Network error — check connection');
  }
};
