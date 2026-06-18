/* global AuthenticatorApp */

AuthenticatorApp.prototype.loadGithubConfig = async function() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ghToken', 'ghRepo'], (result) => {
      this.ghToken = result.ghToken || '';
      let repo = result.ghRepo || '';
      if (repo) {
        repo = repo.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/^\/+|\/+$/g, '');
        this.ghRepo = repo;
      } else {
        this.ghRepo = '';
      }
      if (this.ghToken && this.ghTokenInput) this.ghTokenInput.value = this.ghToken;
      if (this.ghRepo && this.ghRepoInput) this.ghRepoInput.value = this.ghRepo;
      resolve();
    });
  });
};

AuthenticatorApp.prototype.updateConnectionStatus = function() {
  if (!this.statusBadge || !this.statusText) return;

  const hasConfig = this.ghToken && this.ghRepo;

  // remove old state classes
  this.statusBadge.classList.remove('status-connected', 'status-disconnected', 'status-error');

  if (!hasConfig) {
    this.statusBadge.classList.add('status-disconnected');
    this.statusText.textContent = 'Not Configured';
    this.syncErrorBanner.classList.add('hidden');
  } else if (this.syncError) {
    this.statusBadge.classList.add('status-error');
    this.statusText.textContent = 'Sync Failed';
    // show error banner with reason
    this.syncErrorBanner.classList.remove('hidden');
    if (this.syncErrorText) {
      this.syncErrorText.textContent = this.syncErrorMessage || 'Cloud sync failed';
    }
  } else {
    this.statusBadge.classList.add('status-connected');
    const shortEmail = this.currentEmail.split('@')[0] || 'connected';
    this.statusText.textContent = shortEmail;
    this.syncErrorBanner.classList.add('hidden');
  }

  // update settings panel views
  this.updateSettingsView();
  // update cloud fetch availability in import modal
  this.updateCloudFetchState();
};

AuthenticatorApp.prototype.updateSettingsView = function() {
  if (!this.settingsConnectedView || !this.settingsSetupView) return;

  const hasConfig = this.ghToken && this.ghRepo;

  if (hasConfig) {
    if (!this.isEditingConfig) {
      this.settingsConnectedView.classList.remove('hidden');
      this.settingsSetupView.classList.add('hidden');
    }
    if (this.settingsRepoDisplay) this.settingsRepoDisplay.textContent = this.ghRepo;
    if (this.settingsEmailDisplay) this.settingsEmailDisplay.textContent = this.currentEmail || '—';
    if (this.settingsSyncStatus) {
      if (this.syncError) {
        this.settingsSyncStatus.textContent = 'Error';
        this.settingsSyncStatus.className = 'connected-value status-fail';
        if (this.settingsErrorDetails) {
          this.settingsErrorDetails.classList.remove('hidden');
          if (this.settingsErrorText) this.settingsErrorText.textContent = this.syncErrorMessage || 'Cloud sync failed';
        }
      } else {
        this.settingsSyncStatus.textContent = 'Connected';
        this.settingsSyncStatus.className = 'connected-value status-ok';
        if (this.settingsErrorDetails) this.settingsErrorDetails.classList.add('hidden');
      }
    }
  } else {
    this.isEditingConfig = false;
    this.settingsConnectedView.classList.add('hidden');
    this.settingsSetupView.classList.remove('hidden');
    if (this.cancelGhEditBtn) this.cancelGhEditBtn.classList.add('hidden');
    if (this.settingsErrorDetails) this.settingsErrorDetails.classList.add('hidden');
  }
};

AuthenticatorApp.prototype.startEditingConfig = function() {
  this.isEditingConfig = true;
  if (this.ghTokenInput) this.ghTokenInput.value = this.ghToken || '';
  if (this.ghRepoInput) this.ghRepoInput.value = this.ghRepo || '';
  if (this.settingsConnectedView) this.settingsConnectedView.classList.add('hidden');
  if (this.settingsSetupView) this.settingsSetupView.classList.remove('hidden');
  if (this.cancelGhEditBtn) this.cancelGhEditBtn.classList.remove('hidden');
};

AuthenticatorApp.prototype.cancelEditingConfig = function() {
  this.isEditingConfig = false;
  if (this.settingsConnectedView) this.settingsConnectedView.classList.remove('hidden');
  if (this.settingsSetupView) this.settingsSetupView.classList.add('hidden');
  if (this.cancelGhEditBtn) this.cancelGhEditBtn.classList.add('hidden');
};

AuthenticatorApp.prototype.updateCloudFetchState = function() {
  const hasConfig = this.ghToken && this.ghRepo;
  if (this.cloudFetchNotice) {
    this.cloudFetchNotice.classList.toggle('hidden', hasConfig);
  }
  if (this.fetchGithubBtn) {
    this.fetchGithubBtn.disabled = !hasConfig;
  }
};

AuthenticatorApp.prototype.setSyncError = function(hasError, message) {
  this.syncError = hasError;
  this.syncErrorMessage = message || '';
  chrome.storage.local.set({ syncError: hasError, syncErrorMessage: message || '' });
  this.updateConnectionStatus();
};

AuthenticatorApp.prototype.saveGithubConfig = async function() {
  const token = this.ghTokenInput.value.trim();
  let repo = this.ghRepoInput.value.trim();
  if (!token || !repo) { this.showToast('Fill in both fields'); return; }

  repo = repo.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/^\/+|\/+$/g, '');
  if (!repo) { this.showToast('Invalid repository format'); return; }

  this.isEditingConfig = false;
  this.ghToken = token;
  this.ghRepo = repo;
  await chrome.storage.local.set({ ghToken: token, ghRepo: repo });
  this.setSyncError(false, '');
  this.showToast('Cloud vault linked');
  this.closeSettings();
  this.syncToGithub();
};

AuthenticatorApp.prototype.disconnectVault = async function() {
  this.ghToken = '';
  this.ghRepo = '';
  await chrome.storage.local.remove(['ghToken', 'ghRepo', 'syncError', 'syncErrorMessage']);
  this.syncError = false;
  this.syncErrorMessage = '';
  if (this.ghTokenInput) this.ghTokenInput.value = '';
  if (this.ghRepoInput) this.ghRepoInput.value = '';
  this.updateConnectionStatus();
  this.showToast('Cloud vault disconnected');
};

AuthenticatorApp.prototype.syncToGithub = async function(silent = false) {
  if (!this.ghToken || !this.ghRepo) {
    await this.loadGithubConfig();
  }
  if (!this.ghToken || !this.ghRepo) {
    if (!silent) this.openSettings();
    return;
  }

  if (!silent) this.showToast('Syncing...');
  chrome.runtime.sendMessage({ action: 'githubSync', data: this.accounts }, (res) => {
    if (res && res.success) {
      if (res.mergedAccounts && Array.isArray(res.mergedAccounts)) {
        this.accounts = res.mergedAccounts;
        this.filteredAccounts = [...this.accounts];
        this.saveAccounts();
        this.render();
      }
      if (!silent) {
        this.showToast(this.buildSyncMessage(res.pulled || 0, res.pushed || 0));
      }
      if (res.pulled > 0) {
        this.flashBadge(`${res.pulled} new`);
      }
      this.setSyncError(false, '');
      this.silentFetchAndResolveProfiles();
    } else {
      const reason = res ? res.error : 'Connection timeout';
      if (!silent) this.showToast('Sync failed: ' + reason);
      this.setSyncError(true, reason);
    }
  });
};

AuthenticatorApp.prototype.buildSyncMessage = function(pulled, pushed) {
  if (pulled === 0 && pushed === 0) return 'Synced — up to date';
  const parts = [];
  if (pulled > 0) parts.push(`${pulled} pulled`);
  if (pushed > 0) parts.push(`${pushed} pushed`);
  return 'Synced — ' + parts.join(', ');
};

AuthenticatorApp.prototype.flashBadge = function(text) {
  if (!this.statusText) return;
  const original = this.statusText.textContent;
  this.statusText.textContent = text;
  this.statusBadge.classList.add('badge-flash');
  setTimeout(() => {
    this.statusText.textContent = original;
    this.statusBadge.classList.remove('badge-flash');
  }, 3000);
};
