/* global AuthenticatorApp, VaultSync */

AuthenticatorApp.prototype.loadGithubConfig = async function() {
  const result = await this.storageGet(['ghToken', 'ghRepo']);
  const storedToken = typeof result.ghToken === 'string' ? result.ghToken.trim() : '';
  this.ghToken = /^[A-Za-z0-9_]{20,512}$/.test(storedToken) ? storedToken : '';
  this.ghRepo = VaultSync.normalizeRepo(result.ghRepo);

  if (this.ghRepoInput) this.ghRepoInput.value = this.ghRepo;
  if (this.ghTokenInput) {
    this.ghTokenInput.value = '';
    this.ghTokenInput.placeholder = this.ghToken ? 'Token saved — leave blank to keep it' : 'github_pat_…';
  }
};

AuthenticatorApp.prototype.updateConnectionStatus = function() {
  if (!this.statusBadge || !this.statusText || !this.statusMeta) return;

  const hasConfig = Boolean(this.ghToken && this.ghRepo);
  const classes = [
    'status-connected',
    'status-disconnected',
    'status-error',
    'status-unsynced',
    'status-permission',
    'status-syncing'
  ];
  this.statusBadge.classList.remove(...classes);

  if (!hasConfig) {
    this.statusBadge.classList.add('status-disconnected');
    this.statusText.textContent = 'Local only';
    this.statusMeta.textContent = 'Cloud vault not linked';
    if (this.syncButtonText) this.syncButtonText.textContent = 'Set up sync';
    if (this.syncErrorBanner) this.syncErrorBanner.classList.add('hidden');
  } else if (!this.githubPermissionGranted) {
    this.statusBadge.classList.add('status-permission');
    this.statusText.textContent = 'Permission needed';
    this.statusMeta.textContent = 'Reconnect GitHub access';
    if (this.syncButtonText) this.syncButtonText.textContent = 'Review access';
    if (this.syncErrorBanner) this.syncErrorBanner.classList.add('hidden');
  } else if (this.syncInFlight) {
    this.statusBadge.classList.add('status-syncing');
    this.statusText.textContent = 'Syncing';
    this.statusMeta.textContent = 'Checking the cloud vault';
    if (this.syncButtonText) this.syncButtonText.textContent = 'Syncing';
    if (this.syncErrorBanner) this.syncErrorBanner.classList.add('hidden');
  } else if (this.syncError) {
    this.statusBadge.classList.add('status-error');
    this.statusText.textContent = 'Sync paused';
    this.statusMeta.textContent = 'Review the connection';
    if (this.syncButtonText) this.syncButtonText.textContent = 'Try again';
    if (this.syncErrorBanner) {
      this.syncErrorBanner.classList.remove('hidden');
      if (this.syncErrorText) this.syncErrorText.textContent = this.syncErrorMessage || 'Cloud sync failed';
    }
  } else if (this.localUnsynced) {
    this.statusBadge.classList.add('status-unsynced');
    this.statusText.textContent = 'Changes pending';
    this.statusMeta.textContent = this.lastSyncAt ? 'Last sync ' + this.describeRelativeTime(this.lastSyncAt) : 'Not synced yet';
    if (this.syncButtonText) this.syncButtonText.textContent = 'Sync changes';
    if (this.syncErrorBanner) this.syncErrorBanner.classList.add('hidden');
  } else {
    this.statusBadge.classList.add('status-connected');
    this.statusText.textContent = 'Cloud up to date';
    this.statusMeta.textContent = this.lastSyncAt ? 'Synced ' + this.describeRelativeTime(this.lastSyncAt) : this.ghRepo;
    if (this.syncButtonText) this.syncButtonText.textContent = 'Sync now';
    if (this.syncErrorBanner) this.syncErrorBanner.classList.add('hidden');
  }

  this.statusBadge.title = hasConfig && this.githubPermissionGranted
    ? 'Sync cloud vault'
    : 'Open cloud vault settings';

  this.githubSyncBtn.classList.toggle('sync-alert', Boolean(hasConfig && this.localUnsynced && !this.syncInFlight));
  this.updateSettingsView();
  this.updateCloudFetchState();
};

AuthenticatorApp.prototype.updateSettingsView = function() {
  if (!this.settingsConnectedView || !this.settingsSetupView) return;
  const hasConfig = Boolean(this.ghToken && this.ghRepo);
  const showSetup = !hasConfig || this.isEditingConfig;

  this.settingsConnectedView.classList.toggle('hidden', showSetup);
  this.settingsSetupView.classList.toggle('hidden', !showSetup);
  this.cancelGhEditBtn.classList.toggle('hidden', !hasConfig || !this.isEditingConfig);

  if (showSetup) {
    if (this.ghRepoInput && !this.ghRepoInput.matches(':focus')) this.ghRepoInput.value = this.ghRepo || '';
    if (this.ghTokenInput) {
      this.ghTokenInput.placeholder = this.ghToken ? 'Token saved — leave blank to keep it' : 'github_pat_…';
    }
    if (this.tokenFieldHint) {
      this.tokenFieldHint.textContent = this.ghToken
        ? 'Leave blank to keep the saved token.'
        : 'The token stays in Chrome local storage.';
    }
    return;
  }

  this.settingsRepoDisplay.textContent = this.ghRepo;
  this.settingsEmailDisplay.textContent = this.currentEmail || 'This browser';
  this.settingsLastSync.textContent = this.describeRelativeTime(this.lastSyncAt);

  if (!this.githubPermissionGranted) {
    this.settingsSyncStatus.textContent = 'Permission needed';
    this.settingsSyncStatus.className = 'status-permission-text';
  } else if (this.syncInFlight) {
    this.settingsSyncStatus.textContent = 'Syncing';
    this.settingsSyncStatus.className = 'status-pending';
  } else if (this.syncError) {
    this.settingsSyncStatus.textContent = 'Paused';
    this.settingsSyncStatus.className = 'status-fail';
  } else if (this.localUnsynced) {
    this.settingsSyncStatus.textContent = 'Changes pending';
    this.settingsSyncStatus.className = 'status-pending';
  } else {
    this.settingsSyncStatus.textContent = 'Connected';
    this.settingsSyncStatus.className = 'status-ok';
  }

  if (this.syncError) {
    this.settingsErrorDetails.classList.remove('hidden');
    this.settingsErrorText.textContent = this.syncErrorMessage || 'Cloud sync failed';
  } else {
    this.settingsErrorDetails.classList.add('hidden');
  }
};

AuthenticatorApp.prototype.startEditingConfig = function() {
  this.isEditingConfig = true;
  if (this.ghTokenInput) this.ghTokenInput.value = '';
  if (this.ghRepoInput) this.ghRepoInput.value = this.ghRepo || '';
  this.updateSettingsView();
  setTimeout(() => this.ghTokenInput && this.ghTokenInput.focus(), 0);
};

AuthenticatorApp.prototype.cancelEditingConfig = function() {
  this.isEditingConfig = false;
  if (this.ghTokenInput) this.ghTokenInput.value = '';
  this.updateSettingsView();
};

AuthenticatorApp.prototype.updateCloudFetchState = function() {
  const available = Boolean(this.ghToken && this.ghRepo && this.githubPermissionGranted);
  if (this.cloudFetchNotice) this.cloudFetchNotice.classList.toggle('hidden', available);
  if (this.fetchGithubBtn) this.fetchGithubBtn.disabled = !available;
};

AuthenticatorApp.prototype.setSyncError = async function(hasError, message) {
  this.syncError = Boolean(hasError);
  this.syncErrorMessage = message || '';
  await this.storageSet({
    syncError: this.syncError,
    syncErrorMessage: this.syncErrorMessage
  });
  this.updateConnectionStatus();
};

AuthenticatorApp.prototype.saveGithubConfig = async function(event) {
  if (event) event.preventDefault();
  const typedToken = this.ghTokenInput ? this.ghTokenInput.value.trim() : '';
  const token = typedToken || this.ghToken;
  const repo = VaultSync.normalizeRepo(this.ghRepoInput ? this.ghRepoInput.value : '');

  if (!token) {
    this.showToast('Enter a GitHub token', 'error');
    this.ghTokenInput.focus();
    return;
  }
  if (!/^[A-Za-z0-9_]{20,512}$/.test(token)) {
    this.showToast('Enter a valid GitHub personal access token', 'error');
    this.ghTokenInput.focus();
    return;
  }
  if (!repo) {
    this.showToast('Use the format owner/repository', 'error');
    this.ghRepoInput.focus();
    return;
  }

  const permissionGranted = await this.requestGithubPermission();
  if (!permissionGranted) {
    this.githubPermissionGranted = false;
    this.showToast('GitHub access was not granted', 'error');
    this.updateConnectionStatus();
    return;
  }

  this.githubPermissionGranted = true;
  this.ghToken = token;
  this.ghRepo = repo;
  this.isEditingConfig = false;
  await this.storageSet({ ghToken: token, ghRepo: repo, localUnsynced: true });
  if (this.ghTokenInput) this.ghTokenInput.value = '';
  this.localUnsynced = true;
  await this.setSyncError(false, '');
  this.showToast('Linking cloud vault');

  const synced = await this.syncToGithub(false);
  if (synced) {
    if (this.ghTokenInput) this.ghTokenInput.value = '';
    this.closeSettings();
  } else {
    this.isEditingConfig = true;
    this.updateSettingsView();
  }
};

AuthenticatorApp.prototype.disconnectVault = async function() {
  this.ghToken = '';
  this.ghRepo = '';
  this.syncError = false;
  this.syncErrorMessage = '';
  this.localUnsynced = false;
  this.lastSyncAt = '';
  this.loadedProfiles = [];
  this.resolveProfileEmails();
  await this.storageRemove([
    'ghToken',
    'ghRepo',
    'syncError',
    'syncErrorMessage',
    'localUnsynced',
    'lastSyncAt',
    'loadedProfiles'
  ]);
  await this.storageSet({ [this.storageKey]: this.accounts });
  await this.removeGithubPermission();
  this.githubPermissionGranted = false;
  if (this.ghTokenInput) this.ghTokenInput.value = '';
  if (this.ghRepoInput) this.ghRepoInput.value = '';
  this.applyFiltersAndSort();
  this.updateConnectionStatus();
  this.showToast('Cloud vault disconnected');
};

AuthenticatorApp.prototype.syncToGithub = async function(silent = false) {
  if (!this.ghToken || !this.ghRepo) await this.loadGithubConfig();
  if (!this.ghToken || !this.ghRepo) {
    if (!silent) this.openSettings();
    return false;
  }

  this.githubPermissionGranted = await this.hasGithubPermission();
  if (!this.githubPermissionGranted) {
    if (!silent) {
      this.isEditingConfig = true;
      this.openSettings();
      this.showToast('Reconnect GitHub access to sync', 'error');
    }
    this.updateConnectionStatus();
    return false;
  }

  if (this.syncInFlight) {
    this.syncQueued = true;
    return false;
  }

  this.syncInFlight = true;
  this.setSyncBusy(true);
  this.updateConnectionStatus();
  if (!silent) this.showToast('Syncing cloud vault');

  let succeeded = false;
  const sentAccountsFingerprint = VaultSync.vaultFingerprint(this.accounts);
  const sentDeletionsFingerprint = JSON.stringify(
    VaultSync.normalizeDeletions(this.deletedAccountKeys).sort((a, b) => a.key.localeCompare(b.key))
  );
  try {
    const response = await this.sendRuntimeMessage({
      action: 'vault:sync',
      payload: {
        accounts: this.accounts,
        deletions: this.deletedAccountKeys
      }
    });

    if (!response || !response.success) {
      const failure = new Error('Cloud sync failed');
      failure.userMessage = response && response.error ? response.error : 'Cloud sync failed';
      throw failure;
    }

    const accountsChangedDuringSync = VaultSync.vaultFingerprint(this.accounts) !== sentAccountsFingerprint;
    const deletionsChangedDuringSync = JSON.stringify(
      VaultSync.normalizeDeletions(this.deletedAccountKeys).sort((a, b) => a.key.localeCompare(b.key))
    ) !== sentDeletionsFingerprint;

    if (accountsChangedDuringSync || deletionsChangedDuringSync) {
      this.loadedProfiles = VaultSync.sanitizeProfileGroups(
        Array.isArray(response.profiles) ? response.profiles : this.loadedProfiles
      );
      this.lastSyncAt = response.syncedAt || new Date().toISOString();
      this.syncError = false;
      this.syncErrorMessage = '';
      this.localUnsynced = true;
      this.syncQueued = true;
      await this.storageSet({
        loadedProfiles: this.loadedProfiles,
        lastSyncAt: this.lastSyncAt,
        localUnsynced: true,
        syncError: false,
        syncErrorMessage: ''
      });
      if (!silent) this.showToast('Finishing newer local changes');
      succeeded = true;
      return succeeded;
    }

    this.accounts = VaultSync.sanitizeAccounts(response.mergedAccounts);
    this.loadedProfiles = VaultSync.sanitizeProfileGroups(response.profiles);
    this.lastSyncAt = response.syncedAt || new Date().toISOString();
    this.currentEmail = response.profile || this.currentEmail;
    this.resolveProfileEmails();

    await this.storageSet({
      [this.storageKey]: this.accounts,
      loadedProfiles: this.loadedProfiles,
      deletedAccountKeys: [],
      localUnsynced: false,
      lastSyncAt: this.lastSyncAt,
      syncError: false,
      syncErrorMessage: ''
    });

    this.deletedAccountKeys = [];
    this.localUnsynced = false;
    this.syncError = false;
    this.syncErrorMessage = '';
    this.applyFiltersAndSort();
    if (!silent) this.showToast(this.buildSyncMessage(response.pulled || 0, response.pushed || 0, response.deleted || 0), 'success');
    if ((response.pulled || 0) > 0) this.flashBadge(response.pulled + ' restored');
    succeeded = true;
  } catch (error) {
    const reason = error && error.userMessage
      ? error.userMessage
      : 'The synced vault could not be saved on this device';
    try {
      await this.setSyncError(true, reason);
    } catch (storageError) {
      this.syncError = true;
      this.syncErrorMessage = reason;
    }
    if (!silent) this.showToast(reason, 'error');
  } finally {
    this.syncInFlight = false;
    this.setSyncBusy(false);
    this.updateConnectionStatus();

    if (this.syncQueued) {
      this.syncQueued = false;
      setTimeout(() => this.syncToGithub(true), 0);
    }
  }

  return succeeded;
};

AuthenticatorApp.prototype.buildSyncMessage = function(pulled, pushed, deleted) {
  const changes = [];
  if (pulled > 0) changes.push(pulled + ' restored');
  if (pushed > 0) changes.push(pushed + ' uploaded');
  if (deleted > 0) changes.push(deleted + ' removed');
  return changes.length ? 'Synced · ' + changes.join(', ') : 'Cloud vault is up to date';
};

AuthenticatorApp.prototype.flashBadge = function(text) {
  if (!this.statusText) return;
  const original = this.statusText.textContent;
  this.statusText.textContent = text;
  this.statusBadge.classList.add('badge-flash');
  setTimeout(() => {
    this.statusText.textContent = original;
    this.statusBadge.classList.remove('badge-flash');
  }, 2400);
};

AuthenticatorApp.prototype.setLocalUnsynced = async function(value) {
  this.localUnsynced = Boolean(value);
  await this.storageSet({ localUnsynced: this.localUnsynced });
  this.updateConnectionStatus();
};

AuthenticatorApp.prototype.syncAfterLocalChange = async function() {
  await this.saveAccounts(false);
  if (this.ghToken && this.ghRepo && this.githubPermissionGranted) {
    return this.syncToGithub(true);
  }
  return false;
};
