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
    this.settingsConnectedView = document.getElementById('settings-connected-view');
    this.settingsSetupView = document.getElementById('settings-setup-view');
    this.settingsRepoDisplay = document.getElementById('settings-repo-display');
    this.settingsEmailDisplay = document.getElementById('settings-email-display');
    this.settingsSyncStatus = document.getElementById('settings-sync-status');

    // cloud fetch notice
    this.cloudFetchNotice = document.getElementById('cloud-fetch-unavailable');
    this.openSettingsFromImport = document.getElementById('open-settings-from-import');

    // confirm overlay
    this.confirmOverlay = document.getElementById('confirm-overlay');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');
    this.confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    this.confirmProceedBtn = document.getElementById('confirm-proceed-btn');

    this.init();
  }

  async init() {
    await this.loadAccounts();
    await this.loadGithubConfig();
    this.detectIdentity();
    this.setupEventListeners();
    this.startTimer();
    this.applyFiltersAndSort();
    this.updateConnectionStatus();
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
        this.ghRepo = result.ghRepo || '';
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
      this.settingsConnectedView.classList.remove('hidden');
      this.settingsSetupView.classList.add('hidden');
      if (this.settingsRepoDisplay) this.settingsRepoDisplay.textContent = this.ghRepo;
      if (this.settingsEmailDisplay) this.settingsEmailDisplay.textContent = this.currentEmail || '—';
      if (this.settingsSyncStatus) {
        if (this.syncError) {
          this.settingsSyncStatus.textContent = 'Error';
          this.settingsSyncStatus.className = 'connected-value status-fail';
        } else {
          this.settingsSyncStatus.textContent = 'Connected';
          this.settingsSyncStatus.className = 'connected-value status-ok';
        }
      }
    } else {
      this.settingsConnectedView.classList.add('hidden');
      this.settingsSetupView.classList.remove('hidden');
    }
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

    if (this.githubSyncBtn) this.githubSyncBtn.addEventListener('click', () => this.syncToGithub());
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

    // import modal toggle
    const toggleImport = () => this.importModal.classList.toggle('hidden');
    if (this.importBtn) this.importBtn.addEventListener('click', toggleImport);

    // close button inside import modal
    const closeImportBtn = this.importModal?.querySelector('.close-modal');
    if (closeImportBtn) closeImportBtn.addEventListener('click', toggleImport);
    window.addEventListener('click', (e) => { if (e.target === this.importModal) toggleImport(); });

    // add-first-btn in empty state (delegated to handle dynamic rendering)
    if (this.accountList) {
      this.accountList.addEventListener('click', (e) => {
        if (e.target && e.target.closest('#add-first-btn')) {
          toggleImport();
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
    if (this.settingsModal) this.settingsModal.classList.add('hidden');
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
    const repo = this.ghRepoInput.value.trim();
    if (!token || !repo) { this.showToast('Fill in both fields'); return; }

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

  async syncToGithub() {
    if (!this.ghToken || !this.ghRepo) {
      // reload from storage in case it was set elsewhere
      await this.loadGithubConfig();
    }
    if (!this.ghToken || !this.ghRepo) {
      this.openSettings();
      return;
    }

    this.showToast('Syncing to cloud...');
    chrome.runtime.sendMessage({ action: 'githubSync', data: this.accounts }, (res) => {
      if (res && res.success) {
        this.showToast('Vault synced');
        this.setSyncError(false, '');
      } else {
        const reason = res ? res.error : 'Connection timeout';
        this.showToast('Sync failed: ' + reason);
        this.setSyncError(true, reason);
      }
    });
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
        this.loadedProfiles = [];
        for (let f of files) {
          if (f.name.endsWith('.json')) {
            const dataRes = await fetch(f.download_url);
            const profileData = await dataRes.json();
            this.loadedProfiles.push(profileData);
          }
        }
        if (this.loadedProfiles.length === 0) {
          this.showToast('No profiles found in cloud vault');
        } else {
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
    this.loadedProfiles.forEach((profile, index) => {
      const row = document.createElement('div');
      row.className = 'sort-chip';
      row.style.width = '100%'; row.style.borderRadius = '8px';
      row.style.display = 'flex'; row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px'; row.style.marginBottom = '4px';
      row.innerHTML = `<span style="font-size: 0.75rem">${profile.email}</span><span style="font-size: 0.6rem; opacity: 0.6">${profile.accounts.length} items</span>`;
      row.onclick = () => {
        document.querySelectorAll('#github-profiles-list .sort-chip').forEach(c => c.classList.remove('active'));
        row.classList.add('active');
        this.selectedProfileIndex = index;
        this.renderAccountPreview(profile.accounts);
      };
      container.appendChild(row);
    });
  }

  renderAccountPreview(accounts) {
    const container = document.getElementById('github-accounts-list');
    if (!container) return;
    container.innerHTML = '';
    document.getElementById('github-accounts-preview').classList.remove('hidden');
    accounts.forEach(acc => {
      const chip = document.createElement('div');
      chip.className = 'sort-chip'; chip.style.fontSize = '0.65rem';
      chip.innerText = acc.issuer;
      container.appendChild(chip);
    });
  }

  importFromSelectedProfile() {
    if (this.selectedProfileIndex === undefined) { this.showToast('Select a profile first'); return; }
    const profile = this.loadedProfiles[this.selectedProfileIndex];
    let addedCount = 0;
    profile.accounts.forEach(acc => { if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) addedCount++; });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.showToast(`Imported ${addedCount} accounts`);
    this.syncToGithub();
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
    this.accounts.push({ id: Date.now() + Math.random(), secret, issuer, label, uri, lastUsed: 0 });
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
      const added = this.addAccount(totp.secret.base32, totp.issuer || 'Unknown', totp.label || 'Account', uri);
      if (added) {
        this.showStatus('Account added', 'success');
        setTimeout(() => this.importModal.classList.add('hidden'), 800);
      } else {
        this.showStatus('Account already exists', 'error');
      }
    } catch (e) {
      this.showStatus('Invalid QR code format', 'error');
    }
  }

  addAccount(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) return false;
    this.accounts.push({ id: Date.now(), secret, issuer, label, uri, lastUsed: 0 });
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
        this.accountList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
            </div>
            <p>No accounts yet</p>
            <button id="add-first-btn">Add Your First Account</button>
          </div>`;
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
          <div class="account-info">
            <input type="text" class="edit-field edit-label" value="${this.escapeHtml(acc.label)}" placeholder="Label">
            <input type="text" class="edit-field edit-issuer" value="${this.escapeHtml(acc.issuer)}" placeholder="Issuer">
            <div class="edit-actions">
              <button class="edit-save">Save</button>
              <button class="edit-cancel">Cancel</button>
            </div>
          </div>`;

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
        });

        // action: explicit copy
        el.querySelector('.action-copy').addEventListener('click', (e) => {
          e.stopPropagation();
          const totp = new OTPAuth.TOTP({ secret: acc.secret });
          navigator.clipboard.writeText(totp.generate());
          this.showToast('Copied to clipboard');
          acc.lastUsed = Date.now();
          this.saveAccounts();
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
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
