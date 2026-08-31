/* global AuthenticatorApp, VaultSync */

AuthenticatorApp.prototype.resolveProfileEmails = function() {
  if (!Array.isArray(this.loadedProfiles) || this.loadedProfiles.length === 0) {
    let cleared = false;
    this.accounts.forEach((account) => {
      if (account.profile) {
        delete account.profile;
        cleared = true;
      }
    });
    return cleared;
  }
  let modified = false;

  this.accounts.forEach((account) => {
    const key = VaultSync.accountKey(account);
    const matchingProfiles = this.loadedProfiles
      .filter((profile) => Array.isArray(profile.accounts) && profile.accounts.some((remoteAccount) => {
        return VaultSync.accountKey(remoteAccount) === key;
      }))
      .map((profile) => profile.email)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const profileText = matchingProfiles.join(', ');

    if ((account.profile || '') !== profileText) {
      account.profile = profileText;
      modified = true;
    }
  });

  return modified;
};

AuthenticatorApp.prototype.applyFetchedProfiles = async function(response, silent = false) {
  if (!response || !response.success) {
    const reason = response && response.error ? response.error : 'Cloud vault could not be loaded';
    if (!silent) this.showToast(reason, 'error');
    return false;
  }

  this.loadedProfiles = VaultSync.sanitizeProfileGroups(response.profiles);
  this.currentEmail = response.profile || this.currentEmail;
  this.resolveProfileEmails();
  await this.storageSet({
    loadedProfiles: this.loadedProfiles,
    [this.storageKey]: this.accounts
  });
  this.render();
  return true;
};

AuthenticatorApp.prototype.silentFetchAndResolveProfiles = async function() {
  if (!this.ghToken || !this.ghRepo || !this.githubPermissionGranted) return false;
  const response = await this.sendRuntimeMessage({ action: 'vault:fetch' });
  return this.applyFetchedProfiles(response, true);
};

AuthenticatorApp.prototype.fetchFromGithub = async function() {
  if (!this.ghToken || !this.ghRepo) await this.loadGithubConfig();
  if (!this.ghToken || !this.ghRepo || !this.githubPermissionGranted) {
    this.showToast('Link the cloud vault in settings first', 'error');
    return;
  }

  this.fetchGithubBtn.disabled = true;
  this.fetchGithubBtn.setAttribute('aria-busy', 'true');
  this.showToast('Fetching cloud profiles');
  let applied = false;
  try {
    const response = await this.sendRuntimeMessage({ action: 'vault:fetch' });
    applied = await this.applyFetchedProfiles(response, false);
  } catch (error) {
    this.showToast('Cloud profiles could not be saved on this device', 'error');
  } finally {
    this.fetchGithubBtn.disabled = false;
    this.fetchGithubBtn.setAttribute('aria-busy', 'false');
  }

  if (!applied) return;
  this.selectedProfileEmails.clear();
  this.selectedAccountSecrets.clear();
  this.currentCloudAccounts = [];
  if (this.cloudAccountsSearchInput) this.cloudAccountsSearchInput.value = '';
  if (this.cloudAccountsClearBtn) this.cloudAccountsClearBtn.classList.add('hidden');
  const preview = document.getElementById('github-accounts-preview');
  if (preview) preview.classList.add('hidden');

  if (this.loadedProfiles.length === 0) {
    this.showStatus('The cloud vault has no profiles yet', 'error');
    return;
  }

  this.renderProfileSelection();
  this.showToast('Cloud profiles ready', 'success');
};
