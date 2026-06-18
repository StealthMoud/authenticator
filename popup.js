/* global jsQR, OTPAuth */

class AuthenticatorApp {
  constructor() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.timerInterval = null;
    this.storageKey = 'authenticator_accounts';
    this.currentSort = 'custom';
    this.sortAscending = true;
    this.privacyMode = false;
    this.currentEmail = '';
    this.loadedProfiles = [];
    this.editingAccountId = null;
    this.selectedProfileEmails = new Set();
    this.selectedAccountSecrets = new Set();

    // cache dom refs
    this.accountList = document.getElementById('account-list');
    this.searchInput = document.getElementById('search-input');
    this.importBtn = document.getElementById('import-btn');
    this.importModal = document.getElementById('import-modal');
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.statusMsg = document.getElementById('import-status');
    this.progressBar = document.getElementById('global-timer');
    this.clearAllBtn = document.getElementById('clear-all-btn');
    this.privacyBtn = document.getElementById('privacy-btn');
    this.toastContainer = document.getElementById('toast-container');
    this.githubSyncBtn = document.getElementById('github-sync-btn');
    this.exportVaultBtn = document.getElementById('export-vault-btn');
    this.saveGhConfigBtn = document.getElementById('save-gh-config');
    this.fetchGithubBtn = document.getElementById('fetch-github-btn');
    this.importAllGhBtn = document.getElementById('import-all-github');
    this.importSelectedGhBtn = document.getElementById('import-selected-profile');
    this.ghTokenInput = document.getElementById('gh-token');
    this.ghRepoInput = document.getElementById('gh-repo');
    this.sortOrderBtn = document.getElementById('sort-order-btn');
    this.syncErrorBanner = document.getElementById('sync-error-banner');
    this.syncErrorText = document.getElementById('sync-error-text');
    this.fixSyncBtn = document.getElementById('fix-sync-btn');

    // status badge
    this.statusBadge = document.getElementById('status-badge');
    this.statusText = document.getElementById('status-text');

    // settings panel
    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsModal = document.getElementById('settings-modal');
    this.disconnectBtn = document.getElementById('disconnect-vault-btn');
    this.editVaultBtn = document.getElementById('edit-vault-btn');
    this.cancelGhEditBtn = document.getElementById('cancel-gh-edit');
    this.settingsConnectedView = document.getElementById('settings-connected-view');
    this.settingsSetupView = document.getElementById('settings-setup-view');
    this.settingsRepoDisplay = document.getElementById('settings-repo-display');
    this.settingsEmailDisplay = document.getElementById('settings-email-display');
    this.settingsSyncStatus = document.getElementById('settings-sync-status');
    this.settingsErrorDetails = document.getElementById('settings-error-details');
    this.settingsErrorText = document.getElementById('settings-error-text');
    this.isEditingConfig = false;

    // cloud fetch notice
    this.cloudFetchNotice = document.getElementById('cloud-fetch-unavailable');
    this.openSettingsFromImport = document.getElementById('open-settings-from-import');

    // confirm overlay
    this.confirmOverlay = document.getElementById('confirm-overlay');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');
    this.confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    this.confirmProceedBtn = document.getElementById('confirm-proceed-btn');

    // import modal subviews
    this.importModalTitle = document.getElementById('import-title');
    this.importModalSubtitle = document.getElementById('import-subtitle');
    this.importDivider = document.getElementById('import-divider');
    this.githubRestoreSection = document.getElementById('github-restore-section');

    this.init();
  }

  async init() {
    this.setupResizeHandler();
    await this.loadAccounts();
    await this.loadGithubConfig();
    this.detectIdentity();
    this.setupEventListeners();
    this.startTimer();
    this.applyFiltersAndSort();
    this.updateConnectionStatus();

    // Silently trigger pull-and-merge sync on startup if configured
    if (this.ghToken && this.ghRepo) {
      this.syncToGithub(true);
    }
  }

  // detect which Chrome profile is running
  detectIdentity() {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      this.currentEmail = info.email || 'offline-profile';
      this.updateConnectionStatus();
    });
  }

  async loadAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey, 'privacyMode', 'sortAscending', 'syncError', 'syncErrorMessage'], (result) => {
        this.accounts = result[this.storageKey] || [];
        this.privacyMode = result.privacyMode || false;
        this.sortAscending = (result.sortAscending !== undefined) ? result.sortAscending : true;
        
        // Auto-fix any missing/Unknown issuers from the label if possible
        let modified = false;
        this.accounts.forEach(acc => {
          if (!acc.issuer || acc.issuer.toLowerCase() === 'unknown') {
            const inferred = this.inferIssuer(acc.label, acc.issuer);
            if (inferred && inferred.toLowerCase() !== 'unknown') {
              acc.issuer = inferred;
              modified = true;
            }
          }
        });
        if (modified) {
          this.saveAccounts();
        }

        this.filteredAccounts = [...this.accounts];
        this.syncError = result.syncError || false;
        this.syncErrorMessage = result.syncErrorMessage || '';
        this.updateOrderIcon();
        resolve();
      });
    });
  }

  async loadGithubConfig() {
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
  }

  async saveAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: this.accounts }, () => resolve());
    });
  }

  // -- Connection Status --

  updateConnectionStatus() {
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
  }

  updateSettingsView() {
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
  }

  startEditingConfig() {
    this.isEditingConfig = true;
    if (this.ghTokenInput) this.ghTokenInput.value = this.ghToken || '';
    if (this.ghRepoInput) this.ghRepoInput.value = this.ghRepo || '';
    if (this.settingsConnectedView) this.settingsConnectedView.classList.add('hidden');
    if (this.settingsSetupView) this.settingsSetupView.classList.remove('hidden');
    if (this.cancelGhEditBtn) this.cancelGhEditBtn.classList.remove('hidden');
  }

  cancelEditingConfig() {
    this.isEditingConfig = false;
    if (this.settingsConnectedView) this.settingsConnectedView.classList.remove('hidden');
    if (this.settingsSetupView) this.settingsSetupView.classList.add('hidden');
    if (this.cancelGhEditBtn) this.cancelGhEditBtn.classList.add('hidden');
  }

  updateCloudFetchState() {
    const hasConfig = this.ghToken && this.ghRepo;
    if (this.cloudFetchNotice) {
      this.cloudFetchNotice.classList.toggle('hidden', hasConfig);
    }
    if (this.fetchGithubBtn) {
      this.fetchGithubBtn.disabled = !hasConfig;
    }
  }

  setSyncError(hasError, message) {
    this.syncError = hasError;
    this.syncErrorMessage = message || '';
    chrome.storage.local.set({ syncError: hasError, syncErrorMessage: message || '' });
    this.updateConnectionStatus();
  }

  // -- Event Listeners --

  setupEventListeners() {
    if (this.searchInput) this.searchInput.addEventListener('input', () => this.applyFiltersAndSort());
    if (this.privacyBtn) this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());

    if (this.exportVaultBtn) {
      this.exportVaultBtn.addEventListener('click', () => {
        if (this.accounts.length === 0) { this.showToast('Nothing to export'); return; }
        this.confirmAction('Export Backup', 'Download a local backup of your 2FA codes?', () => this.exportVault());
      });
    }

    if (this.githubSyncBtn) {
      this.githubSyncBtn.addEventListener('click', () => {
        if (!this.ghToken || !this.ghRepo) {
          this.openSettings();
        } else {
          this.syncToGithub();
        }
      });
    }
    if (this.saveGhConfigBtn) this.saveGhConfigBtn.addEventListener('click', () => this.saveGithubConfig());
    if (this.fetchGithubBtn) this.fetchGithubBtn.addEventListener('click', () => this.fetchFromGithub());
    if (this.importSelectedGhBtn) this.importSelectedGhBtn.addEventListener('click', () => this.importFromSelectedProfile());
    if (this.importAllGhBtn) this.importAllGhBtn.addEventListener('click', () => this.importAllFromCloud());

    // fix-sync opens settings, not import
    if (this.fixSyncBtn) {
      this.fixSyncBtn.addEventListener('click', () => this.openSettings());
    }

    // status badge opens settings
    if (this.statusBadge) {
      this.statusBadge.addEventListener('click', () => this.openSettings());
    }

    // settings panel
    if (this.settingsBtn) this.settingsBtn.addEventListener('click', () => this.openSettings());
    const closeSettings = this.settingsModal?.querySelector('.close-settings');
    if (closeSettings) closeSettings.addEventListener('click', () => this.closeSettings());
    window.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });

    if (this.editVaultBtn) this.editVaultBtn.addEventListener('click', () => this.startEditingConfig());
    if (this.cancelGhEditBtn) this.cancelGhEditBtn.addEventListener('click', () => this.cancelEditingConfig());

    // disconnect vault
    if (this.disconnectBtn) {
      this.disconnectBtn.addEventListener('click', () => {
        this.confirmAction('Disconnect Vault', 'Remove cloud sync configuration? Your cloud data will stay intact.', () => this.disconnectVault());
      });
    }

    // link from import modal -> settings
    if (this.openSettingsFromImport) {
      this.openSettingsFromImport.addEventListener('click', () => {
        this.importModal.classList.add('hidden');
        this.openSettings();
      });
    }

    // sort order toggle
    if (this.sortOrderBtn) {
      this.sortOrderBtn.addEventListener('click', () => {
        this.sortAscending = !this.sortAscending;
        chrome.storage.local.set({ sortAscending: this.sortAscending });
        this.updateOrderIcon();
        this.applyFiltersAndSort();
      });
    }

    // sort chips
    document.querySelectorAll('.sort-chip').forEach(chip => {
      if (chip.dataset.sort) {
        chip.addEventListener('click', (e) => {
          document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.currentSort = e.currentTarget.dataset.sort;
          this.applyFiltersAndSort();
        });
      }
    });

    // clear all accounts (now in settings panel)
    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener('click', () => {
        if (this.accounts.length === 0) {
          this.showToast('No data to clear'); return;
        }
        this.confirmAction('Reset Vault', 'Delete all accounts from this device? This cannot be undone.', () => this.clearAllAccounts());
      });
    }

    // import modal trigger & close
    if (this.importBtn) this.importBtn.addEventListener('click', () => this.openImportModal('all'));

    const closeImportBtn = this.importModal?.querySelector('.close-modal');
    if (closeImportBtn) closeImportBtn.addEventListener('click', () => this.closeImportModal());
    window.addEventListener('click', (e) => { if (e.target === this.importModal) this.closeImportModal(); });

    // empty state button delegation
    if (this.accountList) {
       this.accountList.addEventListener('click', (e) => {
         if (e.target) {
           if (e.target.closest('#add-first-btn')) {
             this.openImportModal('add');
           } else if (e.target.closest('#restore-first-btn')) {
             this.openImportModal('restore');
             this.fetchFromGithub();
           }
         }
       });
     }

    // file drop zone
    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => this.fileInput.click());
      this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
      this.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropZone.classList.add('dragover'); });
      this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) this.processFile(file);
      });
    }
  }

  openSettings() {
    if (this.settingsModal) {
      this.settingsModal.classList.remove('hidden');
      this.updateSettingsView();
    }
  }

  closeSettings() {
    if (this.settingsModal) {
      this.settingsModal.classList.add('hidden');
      this.isEditingConfig = false;
      this.updateSettingsView();
    }
  }

  openImportModal(mode = 'all') {
    if (!this.importModal) return;
    this.importModal.classList.remove('hidden');

    if (mode === 'all') {
      if (this.importModalTitle) this.importModalTitle.textContent = 'Add Account';
      if (this.importModalSubtitle) this.importModalSubtitle.textContent = 'Scan a QR code image or restore from your cloud vault.';
      if (this.dropZone) this.dropZone.classList.remove('hidden');
      if (this.importDivider) this.importDivider.classList.remove('hidden');
      if (this.githubRestoreSection) this.githubRestoreSection.classList.remove('hidden');
    } else if (mode === 'add') {
      if (this.importModalTitle) this.importModalTitle.textContent = 'Add Account';
      if (this.importModalSubtitle) this.importModalSubtitle.textContent = 'Scan a QR code image to add your 2FA account.';
      if (this.dropZone) this.dropZone.classList.remove('hidden');
      if (this.importDivider) this.importDivider.classList.add('hidden');
      if (this.githubRestoreSection) this.githubRestoreSection.classList.add('hidden');
    } else if (mode === 'restore') {
      if (this.importModalTitle) this.importModalTitle.textContent = 'Restore Cloud Data';
      if (this.importModalSubtitle) this.importModalSubtitle.textContent = 'Select and restore your profiles from the linked cloud vault.';
      if (this.dropZone) this.dropZone.classList.add('hidden');
      if (this.importDivider) this.importDivider.classList.add('hidden');
      if (this.githubRestoreSection) this.githubRestoreSection.classList.remove('hidden');
    }
  }

  closeImportModal() {
    if (this.importModal) {
      this.importModal.classList.add('hidden');
    }
  }

  confirmAction(title, message, onConfirm) {
    if (!this.confirmOverlay) return;
    this.confirmTitle.innerText = title;
    this.confirmMessage.innerText = message;
    this.confirmOverlay.classList.remove('hidden');

    const cleanup = () => {
      this.confirmOverlay.classList.add('hidden');
      this.confirmCancelBtn.removeEventListener('click', onCancel);
      this.confirmProceedBtn.removeEventListener('click', onProceed);
    };

    const onCancel = () => cleanup();
    const onProceed = () => {
      cleanup();
      onConfirm();
    };

    this.confirmCancelBtn.addEventListener('click', onCancel);
    this.confirmProceedBtn.addEventListener('click', onProceed);
  }

  updateOrderIcon() {
    const asc = document.getElementById('order-asc');
    const desc = document.getElementById('order-desc');
    if (!asc || !desc) return;
    if (this.sortAscending) {
      asc.classList.remove('hidden');
      desc.classList.add('hidden');
    } else {
      asc.classList.add('hidden');
      desc.classList.remove('hidden');
    }
  }

  // -- GitHub / Cloud Sync --

  async saveGithubConfig() {
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
  }

  async disconnectVault() {
    this.ghToken = '';
    this.ghRepo = '';
    await chrome.storage.local.remove(['ghToken', 'ghRepo', 'syncError', 'syncErrorMessage']);
    this.syncError = false;
    this.syncErrorMessage = '';
    if (this.ghTokenInput) this.ghTokenInput.value = '';
    if (this.ghRepoInput) this.ghRepoInput.value = '';
    this.updateConnectionStatus();
    this.showToast('Cloud vault disconnected');
  }

  async syncToGithub(silent = false) {
    if (!this.ghToken || !this.ghRepo) {
      // reload from storage in case it was set elsewhere
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
        // flash the badge when new accounts were pulled from remote
        if (res.pulled > 0) {
          this.flashBadge(`${res.pulled} new`);
        }
        this.setSyncError(false, '');
      } else {
        const reason = res ? res.error : 'Connection timeout';
        if (!silent) this.showToast('Sync failed: ' + reason);
        this.setSyncError(true, reason);
      }
    });
  }

  buildSyncMessage(pulled, pushed) {
    if (pulled === 0 && pushed === 0) return 'Synced — up to date';
    const parts = [];
    if (pulled > 0) parts.push(`${pulled} pulled`);
    if (pushed > 0) parts.push(`${pushed} pushed`);
    return 'Synced — ' + parts.join(', ');
  }

  flashBadge(text) {
    if (!this.statusText) return;
    const original = this.statusText.textContent;
    this.statusText.textContent = text;
    this.statusBadge.classList.add('badge-flash');
    setTimeout(() => {
      this.statusText.textContent = original;
      this.statusBadge.classList.remove('badge-flash');
    }, 3000);
  }

  async fetchFromGithub() {
    if (!this.ghToken || !this.ghRepo) {
      await this.loadGithubConfig();
    }
    if (!this.ghToken || !this.ghRepo) {
      this.showToast('Set up cloud vault in Settings first');
      return;
    }

    this.showToast('Fetching cloud profiles...');
    const url = `https://api.github.com/repos/${this.ghRepo}/contents/profiles`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': `token ${this.ghToken}` } });
      if (res.ok) {
        const files = await res.json();
        const profileMap = new Map();
        for (let f of files) {
          if (f.name.endsWith('.json')) {
            const dataRes = await fetch(f.download_url);
            const profileData = await dataRes.json();
            if (profileData && profileData.email) {
              const existing = profileMap.get(profileData.email);
              if (!existing || new Date(profileData.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
                profileMap.set(profileData.email, profileData);
              }
            }
          }
        }
        this.loadedProfiles = Array.from(profileMap.values());
        if (this.loadedProfiles.length === 0) {
          this.showToast('No profiles found in cloud vault');
        } else {
          this.selectedProfileEmails.clear();
          this.selectedAccountSecrets.clear();
          const previewContainer = document.getElementById('github-accounts-preview');
          if (previewContainer) previewContainer.classList.add('hidden');
          this.renderProfileSelection();
        }
      } else {
        this.showToast('No profiles found in cloud vault');
      }
    } catch (e) {
      this.showToast('Network error — check connection');
    }
  }

  renderProfileSelection() {
    const container = document.getElementById('github-profiles-list');
    if (!container) return;
    container.innerHTML = '';
    document.getElementById('profile-selection-list').classList.remove('hidden');
    this.loadedProfiles.forEach((profile) => {
      const row = document.createElement('div');
      row.className = 'sort-chip';
      row.style.width = '100%'; row.style.borderRadius = '8px';
      row.style.display = 'flex'; row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px'; row.style.marginBottom = '4px';

      if (this.selectedProfileEmails.has(profile.email)) {
        row.classList.add('active');
      }

      row.innerHTML = `<span style="font-size: 0.75rem">${profile.email}</span><span style="font-size: 0.6rem; opacity: 0.6">${profile.accounts.length} items</span>`;
      
      row.onclick = () => {
        if (this.selectedProfileEmails.has(profile.email)) {
          this.selectedProfileEmails.delete(profile.email);
          row.classList.remove('active');
        } else {
          this.selectedProfileEmails.add(profile.email);
          row.classList.add('active');
        }
        this.updateCombinedAccounts();
      };
      container.appendChild(row);
    });
  }

  updateCombinedAccounts() {
    const combinedAccounts = [];
    const addedSecrets = new Set();
    
    this.loadedProfiles.forEach(profile => {
      if (this.selectedProfileEmails.has(profile.email)) {
        profile.accounts.forEach(acc => {
          if (acc && acc.secret && !addedSecrets.has(acc.secret)) {
            addedSecrets.add(acc.secret);
            combinedAccounts.push(acc);
          }
        });
      }
    });

    this.selectedAccountSecrets.clear();
    combinedAccounts.forEach(acc => this.selectedAccountSecrets.add(acc.secret));

    const previewContainer = document.getElementById('github-accounts-preview');
    if (combinedAccounts.length === 0) {
      if (previewContainer) previewContainer.classList.add('hidden');
    } else {
      if (previewContainer) previewContainer.classList.remove('hidden');
      this.renderAccountPreview(combinedAccounts);
    }
  }

  renderAccountPreview(accounts) {
    const container = document.getElementById('github-accounts-list');
    if (!container) return;
    container.innerHTML = '';
    
    // Update heading to show selection count
    const previewTitle = document.getElementById('preview-title');
    if (previewTitle) {
      previewTitle.textContent = `Select accounts to import (${this.selectedAccountSecrets.size} of ${accounts.length}):`;
    }

    accounts.forEach(acc => {
      const chip = document.createElement('div');
      chip.className = 'sort-chip';
      chip.style.fontSize = '0.65rem';
      chip.innerText = acc.issuer;
      
      if (this.selectedAccountSecrets.has(acc.secret)) {
        chip.classList.add('active');
      }
      
      chip.onclick = () => {
        if (this.selectedAccountSecrets.has(acc.secret)) {
          this.selectedAccountSecrets.delete(acc.secret);
          chip.classList.remove('active');
        } else {
          this.selectedAccountSecrets.add(acc.secret);
          chip.classList.add('active');
        }
        if (previewTitle) {
          previewTitle.textContent = `Select accounts to import (${this.selectedAccountSecrets.size} of ${accounts.length}):`;
        }
      };
      container.appendChild(chip);
    });
  }

  importFromSelectedProfile() {
    if (this.selectedProfileEmails.size === 0) { this.showToast('Select at least one profile'); return; }
    if (this.selectedAccountSecrets.size === 0) { this.showToast('Select at least one account'); return; }
    
    let addedCount = 0;
    this.loadedProfiles.forEach(profile => {
      if (this.selectedProfileEmails.has(profile.email)) {
        profile.accounts.forEach(acc => {
          if (this.selectedAccountSecrets.has(acc.secret)) {
            if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) {
              addedCount++;
            }
          }
        });
      }
    });
    
    this.applyFiltersAndSort();
    this.saveAccounts();
    this.showToast(`Imported ${addedCount} accounts`);
    this.syncToGithub();
    this.closeImportModal();
  }

  importAllFromCloud() {
    let addedCount = 0;
    this.loadedProfiles.forEach(profile => {
      profile.accounts.forEach(acc => { if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) addedCount++; });
    });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.showToast(`Merged ${addedCount} accounts from all profiles`);
    this.syncToGithub();
  }

  addAccountNoRender(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) return false;
    let cleanLabel = label || 'Account';
    let cleanIssuer = issuer || this.inferIssuer(cleanLabel, 'Unknown');
    if (cleanIssuer.toLowerCase() === 'unknown') {
      cleanIssuer = this.inferIssuer(cleanLabel, 'Unknown');
    }
    
    // Clean up label if it contains issuer prefix
    if (cleanLabel.includes(':') && cleanIssuer && cleanIssuer.toLowerCase() !== 'unknown') {
      const parts = cleanLabel.split(':');
      if (parts[0].trim().toLowerCase() === cleanIssuer.toLowerCase()) {
        cleanLabel = parts.slice(1).join(':').trim();
      }
    }

    this.accounts.push({ id: Date.now() + Math.random(), secret, issuer: cleanIssuer, label: cleanLabel, uri, lastUsed: 0 });
    return true;
  }

  // -- Core: QR handling --

  handleFileSelect(e) { const file = e.target.files[0]; if (file) this.processFile(file); }

  async processFile(file) {
    if (!file || !file.type.startsWith('image/')) { this.showStatus('Not a valid image file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code) this.handleQRCode(code.data);
        else this.showStatus('No QR code found in image', 'error');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleQRCode(uri) {
    try {
      const totp = OTPAuth.URI.parse(uri);
      let label = totp.label || 'Account';
      let issuer = totp.issuer || this.inferIssuer(label, 'Unknown');
      
      // Clean up label if it contains issuer prefix
      if (label.includes(':') && issuer && issuer.toLowerCase() !== 'unknown') {
        const parts = label.split(':');
        if (parts[0].trim().toLowerCase() === issuer.toLowerCase()) {
          label = parts.slice(1).join(':').trim();
        }
      }

      const added = this.addAccount(totp.secret.base32, issuer, label, uri);
      if (added) {
        this.showStatus('Account added', 'success');
        setTimeout(() => this.closeImportModal(), 800);
      } else {
        this.showStatus('Account already exists', 'error');
      }
    } catch (e) {
      this.showStatus('Invalid QR code format', 'error');
    }
  }

  addAccount(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) return false;
    let cleanLabel = label || 'Account';
    let cleanIssuer = issuer || this.inferIssuer(cleanLabel, 'Unknown');
    
    // Clean up label if it contains issuer prefix
    if (cleanLabel.includes(':') && cleanIssuer && cleanIssuer.toLowerCase() !== 'unknown') {
      const parts = cleanLabel.split(':');
      if (parts[0].trim().toLowerCase() === cleanIssuer.toLowerCase()) {
        cleanLabel = parts.slice(1).join(':').trim();
      }
    }

    this.accounts.push({ id: Date.now(), secret, issuer: cleanIssuer, label: cleanLabel, uri, lastUsed: 0 });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.syncToGithub();
    return true;
  }

  // -- Per-account actions --

  deleteAccount(id) {
    this.confirmAction('Delete Account', 'Remove this account? This cannot be undone.', () => {
      this.accounts = this.accounts.filter(a => a.id !== id);
      this.applyFiltersAndSort();
      this.saveAccounts();
      this.syncToGithub();
      this.showToast('Account removed');
    });
  }

  startEdit(id) {
    this.editingAccountId = id;
    this.render();

    // focus the first edit field after render
    const card = this.accountList.querySelector(`[data-id="${id}"]`);
    if (card) {
      const firstInput = card.querySelector('.edit-field');
      if (firstInput) firstInput.focus();
    }
  }

  saveEdit(id) {
    const card = this.accountList.querySelector(`[data-id="${id}"]`);
    if (!card) return;

    const issuerInput = card.querySelector('.edit-issuer');
    const labelInput = card.querySelector('.edit-label');
    const acc = this.accounts.find(a => a.id == id);
    if (!acc) return;

    const newIssuer = issuerInput?.value.trim();
    const newLabel = labelInput?.value.trim();

    if (newIssuer) acc.issuer = newIssuer;
    if (newLabel) acc.label = newLabel;

    this.editingAccountId = null;
    this.applyFiltersAndSort();
    this.saveAccounts();
    this.syncToGithub();
    this.showToast('Account updated');
  }

  cancelEdit() {
    this.editingAccountId = null;
    this.render();
  }

  // -- Sorting & Filtering --

  applyFiltersAndSort() {
    const term = this.searchInput.value.toLowerCase().trim();
    let result = this.accounts.filter(a => a.issuer.toLowerCase().includes(term) || a.label.toLowerCase().includes(term));
    const dir = this.sortAscending ? 1 : -1;

    if (this.currentSort === 'name') {
      result.sort((a, b) => {
        const valA = (a.issuer + a.label).toLowerCase();
        const valB = (b.issuer + b.label).toLowerCase();
        return valA.localeCompare(valB) * dir;
      });
    } else if (this.currentSort === 'newest') {
      result.sort((a, b) => (b.id - a.id) * dir);
    } else if (this.currentSort === 'recent') {
      result.sort((a, b) => ((b.lastUsed || 0) - (a.lastUsed || 0)) * dir);
    } else if (this.currentSort === 'custom') {
      if (!this.sortAscending) result.reverse();
    }
    this.filteredAccounts = result;
    this.render();
  }

  // -- Timer --

  startTimer() { this.updateCodes(); setInterval(() => this.updateCodes(), 1000); }

  updateCodes() {
    const progress = ((30 - (Math.floor(Date.now() / 1000) % 30)) / 30) * 100;
    if (this.progressBar) this.progressBar.style.width = `${progress}%`;
    document.querySelectorAll('.account-item').forEach(item => {
      const acc = this.accounts.find(a => a.id == item.dataset.id);
      if (acc && !item.classList.contains('editing')) {
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        const otpEl = item.querySelector('.account-otp');
        if (otpEl) otpEl.innerText = totp.generate().replace(/(\d{3})/, '$1 ');
      }
    });
  }

  // -- Render --

  render() {
    if (!this.accountList) return;
    this.accountList.classList.toggle('privacy-enabled', this.privacyMode);

    // toggle privacy icon
    const eyeOpen = this.privacyBtn?.querySelector('.eye-open');
    const eyeClosed = this.privacyBtn?.querySelector('.eye-closed');
    if (eyeOpen && eyeClosed) {
      eyeOpen.classList.toggle('hidden', this.privacyMode);
      eyeClosed.classList.toggle('hidden', !this.privacyMode);
    }

    if (this.filteredAccounts.length === 0) {
      if (this.accounts.length === 0) {
        const isCloudConnected = !!(this.ghToken && this.ghRepo);
        if (isCloudConnected) {
          this.accountList.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon" style="color: var(--accent); opacity: 0.8;">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
              </div>
              <p class="empty-title">Cloud Vault Linked</p>
              <p class="empty-subtitle">No accounts on this device yet. Start fresh or restore your cloud data.</p>
              <div class="empty-actions">
                <button id="add-first-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                  Add Account
                </button>
                <button id="restore-first-btn" class="btn-action-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  Restore Cloud Data
                </button>
              </div>
            </div>`;
        } else {
          this.accountList.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              </div>
              <p class="empty-title">No accounts yet</p>
              <button id="add-first-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                Add Your First Account
              </button>
            </div>`;
        }
      } else {
        this.accountList.innerHTML = '<div class="empty-state"><p>No matching accounts</p></div>';
      }
      return;
    }

    this.accountList.innerHTML = '';
    this.filteredAccounts.forEach((acc, i) => {
      const el = document.createElement('div');
      el.dataset.id = acc.id;
      el.style.animationDelay = `${i * 0.05}s`;

      if (this.editingAccountId === acc.id) {
        // inline edit mode
        el.className = 'account-item editing';
        el.innerHTML = `
          <div class="account-icon-wrapper">
            ${this.getIssuerIcon(acc.issuer)}
          </div>
          <div class="account-info">
            <div class="edit-input-group">
              <span class="edit-input-label">Label</span>
              <input type="text" class="edit-field edit-label" value="${this.escapeHtml(acc.label)}" placeholder="Label">
            </div>
            <div class="edit-input-group">
              <span class="edit-input-label">Issuer</span>
              <input type="text" class="edit-field edit-issuer" value="${this.escapeHtml(acc.issuer)}" placeholder="Issuer">
            </div>
            <div class="edit-actions">
              <button class="edit-save">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Save
              </button>
              <button class="edit-cancel">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                Cancel
              </button>
            </div>
          </div>`;

        // live icon updates on issuer input
        const issuerInput = el.querySelector('.edit-issuer');
        const iconWrapper = el.querySelector('.account-icon-wrapper');
        if (issuerInput && iconWrapper) {
          issuerInput.addEventListener('input', () => {
            iconWrapper.innerHTML = this.getIssuerIcon(issuerInput.value);
          });
        }

        // key handler for Enter/Escape
        el.querySelectorAll('.edit-field').forEach(field => {
          field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEdit(acc.id);
            if (e.key === 'Escape') this.cancelEdit();
          });
        });
        el.querySelector('.edit-save').addEventListener('click', (e) => {
          e.stopPropagation();
          this.saveEdit(acc.id);
        });
        el.querySelector('.edit-cancel').addEventListener('click', (e) => {
          e.stopPropagation();
          this.cancelEdit();
        });
      } else {
        // normal display mode
        el.className = 'account-item';
        el.innerHTML = `
          <div class="account-icon-wrapper">
            ${this.getIssuerIcon(acc.issuer)}
          </div>
          <div class="account-info">
            <span class="account-label">${this.escapeHtml(acc.label)}</span>
            <span class="account-issuer">${this.escapeHtml(acc.issuer)}</span>
          </div>
          <div class="account-otp">--- ---</div>
          <div class="account-actions">
            <button class="action-copy" title="Copy code">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
            <button class="action-edit" title="Edit account">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button class="action-delete" title="Delete account">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>`;

        // click on card body -> copy
        el.addEventListener('click', (e) => {
          // dont copy if they clicked an action button
          if (e.target.closest('.account-actions')) return;
          const totp = new OTPAuth.TOTP({ secret: acc.secret });
          navigator.clipboard.writeText(totp.generate());
          this.showToast('Copied to clipboard');
          acc.lastUsed = Date.now();
          this.saveAccounts();

          el.classList.remove('copied-pulse');
          void el.offsetWidth; // trigger reflow to restart keyframe animation
          el.classList.add('copied-pulse');
          setTimeout(() => el.classList.remove('copied-pulse'), 400);
        });

        // action: explicit copy
        el.querySelector('.action-copy').addEventListener('click', (e) => {
          e.stopPropagation();
          const totp = new OTPAuth.TOTP({ secret: acc.secret });
          navigator.clipboard.writeText(totp.generate());
          this.showToast('Copied to clipboard');
          acc.lastUsed = Date.now();
          this.saveAccounts();

          el.classList.remove('copied-pulse');
          void el.offsetWidth; // trigger reflow to restart keyframe animation
          el.classList.add('copied-pulse');
          setTimeout(() => el.classList.remove('copied-pulse'), 400);
        });

        // action: edit
        el.querySelector('.action-edit').addEventListener('click', (e) => {
          e.stopPropagation();
          this.startEdit(acc.id);
        });

        // action: delete
        el.querySelector('.action-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteAccount(acc.id);
        });
      }

      this.accountList.appendChild(el);
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -- Utilities --

  togglePrivacyMode() {
    this.privacyMode = !this.privacyMode;
    chrome.storage.local.set({ privacyMode: this.privacyMode });
    this.render();
  }

  showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    if (this.toastContainer) this.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  showStatus(msg, type) {
    if (this.statusMsg) {
      this.statusMsg.innerText = msg;
      this.statusMsg.className = `status-message status-${type}`;
      this.statusMsg.style.display = 'block';
    }
  }

  clearAllAccounts() {
    this.accounts = [];
    this.saveAccounts();
    this.render();
    this.syncToGithub();
    this.closeSettings();
    this.showToast('Vault cleared');
  }

  exportVault() {
    const backupData = JSON.stringify(this.accounts, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auth_vault_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('Backup file downloaded');
  }

  setupResizeHandler() {
    const edgeLeft = document.getElementById('resize-edge-left');
    const edgeRight = document.getElementById('resize-edge-right');
    const edgeBottom = document.getElementById('resize-edge-bottom');
    if (!edgeLeft && !edgeRight && !edgeBottom) return;

    // Load persisted dimensions
    chrome.storage.local.get(['popupWidth', 'popupHeight'], (res) => {
      if (res.popupWidth) {
        document.body.style.width = `${res.popupWidth}px`;
      }
      if (res.popupHeight) {
        document.body.style.height = `${res.popupHeight}px`;
      }
    });

    const bindResize = (edge, type) => {
      edge.addEventListener('mousedown', (e) => {
        e.preventDefault();
        edge.classList.add('dragging');
        const startWidth = document.body.clientWidth;
        const startHeight = document.body.clientHeight;
        const startX = e.clientX;
        const startY = e.clientY;

        const onMouseMove = (moveEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;

          if (type === 'left') {
            let newWidth = startWidth - deltaX;
            newWidth = Math.max(380, Math.min(800, newWidth));
            document.body.style.width = `${newWidth}px`;
          } else if (type === 'right') {
            let newWidth = startWidth + deltaX;
            newWidth = Math.max(380, Math.min(800, newWidth));
            document.body.style.width = `${newWidth}px`;
          } else if (type === 'bottom') {
            let newHeight = startHeight + deltaY;
            newHeight = Math.max(520, Math.min(600, newHeight));
            document.body.style.height = `${newHeight}px`;
          }
        };

        const onMouseUp = () => {
          edge.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);

          // Persist dimensions
          chrome.storage.local.set({
            popupWidth: document.body.clientWidth,
            popupHeight: document.body.clientHeight
          });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    };

    if (edgeLeft) bindResize(edgeLeft, 'left');
    if (edgeRight) bindResize(edgeRight, 'right');
    if (edgeBottom) bindResize(edgeBottom, 'bottom');
  }

  getIssuerIcon(issuer) {
    const clean = (issuer || '').toLowerCase().trim();
    if (clean.includes('google')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 7.54 3.42l-2.83 2.83A6 6 0 1 0 18 12h-6V8h10a10 10 0 0 1-10 10A10 10 0 0 1 12 2z"/></svg>`;
    }
    if (clean.includes('github')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`;
    }
    if (clean.includes('instagram') || clean.includes('intagram')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`;
    }
    if (clean.includes('discord')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8Z"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/></svg>`;
    }
    if (clean.includes('microsoft') || clean.includes('outlook') || clean.includes('live') || clean.includes('azure')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="3" y="3" rx="1"/><rect width="8" height="8" x="13" y="3" rx="1"/><rect width="8" height="8" x="3" y="13" rx="1"/><rect width="8" height="8" x="13" y="13" rx="1"/></svg>`;
    }
    if (clean.includes('slack')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="6" height="6" x="3" y="3" rx="1"/><rect width="6" height="6" x="15" y="3" rx="1"/><rect width="6" height="6" x="3" y="15" rx="1"/><rect width="6" height="6" x="15" y="15" rx="1"/><path d="M10 6h4"/><path d="M10 18h4"/><path d="M6 10v4"/><path d="M18 10v4"/></svg>`;
    }
    if (clean.includes('facebook')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`;
    }
    if (clean.includes('twitter') || clean.includes('x.com') || clean === 'x') {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/></svg>`;
    }
    if (clean.includes('twitch')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9H9V6h2v5zm4 0h-2V6h2v5z"/></svg>`;
    }
    if (clean.includes('gitlab')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 13.29-1.92-5.9a1 1 0 0 0-.96-.69h-2.14l-1.98-6.1a1 1 0 0 0-1.9 0L11 6.7H8.86a1 1 0 0 0-.96.69l-1.92 5.9a1 1 0 0 0 .36 1.12l8.3 6a1 1 0 0 0 1.18 0l8.3-6a1 1 0 0 0 .36-1.12Z"/></svg>`;
    }
    if (clean.includes('steam')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="3"/></svg>`;
    }
    if (clean.includes('epic')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 15 10-15-10-5z"/></svg>`;
    }
    if (clean.includes('reddit')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 8c1.5 0 3 1.5 3 3v2c0 1.5-1.5 3-3 3s-3-1.5-3-3v-2c0-1.5 1.5-3 3-3z"/></svg>`;
    }
    if (clean.includes('bitbucket')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16l2 14-10 4-10-4z"/></svg>`;
    }
    if (clean.includes('digitalocean') || clean.includes('digital ocean')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/></svg>`;
    }
    if (clean.includes('heroku')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h4"/></svg>`;
    }
    if (clean.includes('cloudflare')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m13 10-4 6h6l-4 6"/></svg>`;
    }
    if (clean.includes('openai') || clean.includes('chatgpt')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>`;
    }
    if (clean.includes('zoom')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
    }
    if (clean.includes('spotify')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12a10.4 10.4 0 0 1 8 0"/><path d="M9 9a8 8 0 0 1 6 0"/><path d="M7 15a12.5 12.5 0 0 1 10 0"/></svg>`;
    }
    if (clean.includes('paypal')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h8a5 5 0 0 1 0 10H9v10H5V8a6 6 0 0 1 2-6z"/><path d="M11 6h5a5 5 0 0 1 0 10h-3v6h-4V10a6 6 0 0 1 3-4z"/></svg>`;
    }
    if (clean.includes('stripe')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="M7 10h10"/><path d="m13 14 4-4-4-4"/></svg>`;
    }
    if (clean.includes('adobe')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22h4l3-7h6l3 7h4L12 2zm1.2 11h-2.4L12 8.5l1.2 4.5z"/></svg>`;
    }
    if (clean.includes('linkedin')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>`;
    }
    if (clean.includes('yahoo')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 3 7 9 7-9"/><path d="M12 12v6"/><line x1="12" x2="12" y1="21" y2="22"/></svg>`;
    }
    if (clean.includes('amazon') || clean.includes('aws')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    }
    if (clean.includes('apple')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-3.5 0-6.5-2.5-6.5-6s3-6.5 6.5-6.5c2 0 3.5 1 4 2 .5-.7 1.5-1.5 2.5-1.5.5 0 .8.2 1 .3-.8 1.7-.8 4.2.7 5.7-1 2.5-2.7 6-5.7 6h-2.5z"/><path d="M12 7.5c1-1 2.5-.5 2.5-.5s.5-1.5-.5-2.5c-1 1-2.5.5-2.5.5s-.5 1.5.5 2.5z"/></svg>`;
    }
    if (clean.includes('coinbase')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M12 14v4"/></svg>`;
    }
    if (clean.includes('binance')) {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l4 4-4 4-4-4 4-4z"/><path d="M12 14l4 4-4 4-4-4 4-4z"/><path d="M20 10l2 2-2 2-2-2 2-2z"/><path d="M4 10l2 2-2 2-2-2 2-2z"/></svg>`;
    }
    return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }

  inferIssuer(label, currentIssuer) {
    const lbl = (label || '').trim();
    if (lbl.includes(':')) {
      return lbl.split(':')[0].trim();
    }
    const lblLower = lbl.toLowerCase();
    const brands = ['google', 'github', 'instagram', 'discord', 'microsoft', 'outlook', 'live', 'azure', 'slack', 'facebook', 'twitter', 'twitch', 'gitlab', 'steam', 'epic', 'reddit', 'bitbucket', 'digitalocean', 'heroku', 'cloudflare', 'openai', 'zoom', 'spotify', 'paypal', 'stripe', 'adobe', 'linkedin', 'yahoo', 'amazon', 'aws', 'apple', 'coinbase', 'binance'];
    const foundBrand = brands.find(b => lblLower.includes(b));
    if (foundBrand) {
      return foundBrand.charAt(0).toUpperCase() + foundBrand.slice(1);
    }
    return currentIssuer || 'Unknown';
  }
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
