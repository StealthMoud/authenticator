/* global OTPAuth */

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
    this.searchClearBtn = document.getElementById('search-clear-btn');
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
    this.cloudAccountsSearchInput = document.getElementById('cloud-accounts-search');
    this.cloudAccountsClearBtn = document.getElementById('cloud-accounts-clear-btn');
    this.currentCloudAccounts = [];

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
      this.silentFetchAndResolveProfiles();
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
      chrome.storage.local.get([this.storageKey, 'privacyMode', 'sortAscending', 'syncError', 'syncErrorMessage', 'loadedProfiles'], (result) => {
        this.accounts = result[this.storageKey] || [];
        this.privacyMode = result.privacyMode || false;
        this.sortAscending = (result.sortAscending !== undefined) ? result.sortAscending : true;
        this.loadedProfiles = result.loadedProfiles || [];
        
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

        // Resolve profile emails from loadedProfiles
        if (this.resolveProfileEmails()) {
          modified = true;
        }

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

  async saveAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: this.accounts }, () => resolve());
    });
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



  startTimer() {
    this.updateCodes();
    setInterval(() => this.updateCodes(), 1000);
  }

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
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
window.AuthenticatorApp = AuthenticatorApp;
