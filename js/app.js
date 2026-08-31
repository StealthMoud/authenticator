/* global OTPAuth, VaultSync */

class AuthenticatorApp {
  constructor() {
    this.storageKey = 'authenticator_accounts';
    this.accounts = [];
    this.filteredAccounts = [];
    this.deletedAccountKeys = [];
    this.loadedProfiles = [];
    this.currentCloudAccounts = [];
    this.selectedProfileEmails = new Set();
    this.selectedAccountSecrets = new Set();

    this.currentSort = 'custom';
    this.sortAscending = true;
    this.privacyMode = false;
    this.currentEmail = '';
    this.lastSyncAt = '';
    this.localUnsynced = false;
    this.syncError = false;
    this.syncErrorMessage = '';
    this.editingAccountId = null;
    this.isEditingConfig = false;
    this.currentQRMode = 'file';
    this.currentImportView = 'scan';
    this.hasCamera = false;
    this.cameraPermissionState = 'prompt';
    this.cameraStream = null;
    this.cameraAnimFrame = null;
    this.cameraCanvas = null;
    this.lastCameraScanAt = 0;
    this.timerInterval = null;
    this.statusTimer = null;
    this.syncInFlight = false;
    this.syncQueued = false;
    this.githubPermissionGranted = false;
    this.lastFocusedElement = null;

    this.cacheDomReferences();
    this.init().catch((error) => this.handleInitFailure(error));
  }

  cacheDomReferences() {
    this.accountList = document.getElementById('account-list');
    this.accountCounter = document.getElementById('account-counter');
    this.searchInput = document.getElementById('search-input');
    this.searchClearBtn = document.getElementById('search-clear-btn');
    this.importBtn = document.getElementById('import-btn');
    this.importModal = document.getElementById('import-modal');
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.backupDropZone = document.getElementById('backup-drop-zone');
    this.backupFileInput = document.getElementById('backup-file-input');
    this.statusMsg = document.getElementById('import-status');
    this.clearAllBtn = document.getElementById('clear-all-btn');
    this.privacyBtn = document.getElementById('privacy-btn');
    this.toastContainer = document.getElementById('toast-container');
    this.githubSyncBtn = document.getElementById('github-sync-btn');
    this.syncButtonText = document.getElementById('sync-button-text');
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
    this.statusBadge = document.getElementById('status-badge');
    this.statusText = document.getElementById('status-text');
    this.statusMeta = document.getElementById('status-meta');

    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsModal = document.getElementById('settings-modal');
    this.settingsSetupView = document.getElementById('settings-setup-view');
    this.settingsConnectedView = document.getElementById('settings-connected-view');
    this.disconnectBtn = document.getElementById('disconnect-vault-btn');
    this.editVaultBtn = document.getElementById('edit-vault-btn');
    this.cancelGhEditBtn = document.getElementById('cancel-gh-edit');
    this.settingsRepoDisplay = document.getElementById('settings-repo-display');
    this.settingsEmailDisplay = document.getElementById('settings-email-display');
    this.settingsSyncStatus = document.getElementById('settings-sync-status');
    this.settingsLastSync = document.getElementById('settings-last-sync');
    this.settingsErrorDetails = document.getElementById('settings-error-details');
    this.settingsErrorText = document.getElementById('settings-error-text');
    this.tokenFieldHint = document.getElementById('token-field-hint');

    this.cloudFetchNotice = document.getElementById('cloud-fetch-unavailable');
    this.openSettingsFromImport = document.getElementById('open-settings-from-import');
    this.cloudAccountsSearchInput = document.getElementById('cloud-accounts-search');
    this.cloudAccountsClearBtn = document.getElementById('cloud-accounts-clear-btn');

    this.confirmOverlay = document.getElementById('confirm-overlay');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');
    this.confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    this.confirmProceedBtn = document.getElementById('confirm-proceed-btn');

    this.importModalTitle = document.getElementById('import-title');
    this.importModalSubtitle = document.getElementById('import-subtitle');
    this.importDivider = document.getElementById('import-divider');
    this.qrInputSection = document.getElementById('qr-input-section');
    this.manualInputSection = document.getElementById('manual-input-section');
    this.githubRestoreSection = document.getElementById('github-restore-section');
    this.importViewTabs = Array.from(document.querySelectorAll('.import-view-tab'));
    this.qrModeTabs = document.getElementById('qr-mode-tabs');
    this.qrTabCamera = document.getElementById('qr-tab-camera');
    this.qrTabFile = document.getElementById('qr-tab-file');
    this.cameraZone = document.getElementById('camera-zone');
    this.cameraPermissionNotice = document.getElementById('camera-permission-notice');
    this.cameraActiveView = document.getElementById('camera-active-view');
    this.requestCameraPermissionBtn = document.getElementById('request-camera-permission-btn');
    this.cameraStreamEl = document.getElementById('camera-stream');
    this.cameraSelect = document.getElementById('camera-select');
    this.cameraSwitchToFile = document.getElementById('camera-switch-to-file');
    this.manualForm = document.getElementById('manual-form');
    this.manualIssuerInput = document.getElementById('manual-issuer');
    this.manualLabelInput = document.getElementById('manual-label');
    this.manualSecretInput = document.getElementById('manual-secret');
    this.manualAlgorithmInput = document.getElementById('manual-algorithm');
    this.manualDigitsInput = document.getElementById('manual-digits');
    this.manualPeriodInput = document.getElementById('manual-period');
    this.globalPeriodRing = document.querySelector('.global-period');
    this.globalPeriod = document.querySelector('.global-period span');
  }

  async init() {
    document.documentElement.dataset.ready = 'false';
    this.setupResizeHandler();
    await this.loadAccounts();
    await this.loadGithubConfig();
    await this.detectIdentity();
    this.githubPermissionGranted = await this.hasGithubPermission();
    this.setupEventListeners();
    this.startTimer();
    this.applyFiltersAndSort();
    this.updateConnectionStatus();
    document.documentElement.dataset.ready = 'true';

    if (this.ghToken && this.ghRepo && this.githubPermissionGranted) {
      await this.syncToGithub(true);
    }
  }

  handleInitFailure(error) {
    document.documentElement.dataset.ready = 'true';
    this.filteredAccounts = [...this.accounts];
    try {
      this.render();
      this.updateConnectionStatus();
      this.showToast('The vault opened in recovery mode. Reload to try again.', 'error');
    } catch (renderError) {
      // Keep the extension page visible even if its recovery render cannot complete.
    }
    console.error('Authenticator initialization failed', error);
  }

  async detectIdentity() {
    const response = await this.sendRuntimeMessage({ action: 'vault:identity' });
    this.currentEmail = response && response.success && response.profile
      ? response.profile
      : 'this-browser';
    this.updateConnectionStatus();
  }

  async loadAccounts() {
    const keys = [
      this.storageKey,
      'privacyMode',
      'sortAscending',
      'currentSort',
      'syncError',
      'syncErrorMessage',
      'loadedProfiles',
      'localUnsynced',
      'deletedAccountKeys',
      'lastSyncAt'
    ];
    const result = await this.storageGet(keys);
    const rawAccounts = Array.isArray(result[this.storageKey]) ? result[this.storageKey] : [];

    this.accounts = VaultSync.sanitizeAccounts(rawAccounts).map((account) => {
      if ((!account.issuer || account.issuer.toLowerCase() === 'unknown') && account.uri) {
        try {
          const otp = OTPAuth.URI.parse(account.uri);
          const enriched = VaultSync.normalizeAccount({
            ...account,
            issuer: otp.issuer || this.inferIssuer(otp.label, 'Unknown'),
            label: otp.label || account.label
          });
          if (enriched) account = enriched;
        } catch (error) {
          account.issuer = this.inferIssuer(account.label, account.issuer);
        }
      }
      return account;
    });
    this.filteredAccounts = [...this.accounts];
    this.privacyMode = Boolean(result.privacyMode);
    this.sortAscending = result.sortAscending !== false;
    this.currentSort = ['custom', 'name', 'newest', 'usage'].includes(result.currentSort)
      ? result.currentSort
      : 'custom';
    this.loadedProfiles = VaultSync.sanitizeProfileGroups(result.loadedProfiles);
    this.localUnsynced = Boolean(result.localUnsynced);
    this.syncError = Boolean(result.syncError);
    this.syncErrorMessage = typeof result.syncErrorMessage === 'string' ? result.syncErrorMessage : '';
    this.deletedAccountKeys = VaultSync.normalizeDeletions(result.deletedAccountKeys);
    this.lastSyncAt = typeof result.lastSyncAt === 'string' ? result.lastSyncAt : '';

    this.resolveProfileEmails();
    await this.storageSet({
      [this.storageKey]: this.accounts,
      deletedAccountKeys: this.deletedAccountKeys,
      currentSort: this.currentSort
    });
    this.updateOrderIcon();
  }

  async saveAccounts(isSync = false) {
    if (!isSync && this.ghToken && this.ghRepo) {
      this.localUnsynced = true;
    }

    await this.storageSet({
      [this.storageKey]: this.accounts,
      deletedAccountKeys: this.deletedAccountKeys,
      localUnsynced: this.localUnsynced
    });
    this.updateConnectionStatus();
  }

  openSettings() {
    this.updateSettingsView();
    this.openDialog(this.settingsModal);
  }

  closeSettings() {
    this.isEditingConfig = false;
    this.updateSettingsView();
    this.closeDialog(this.settingsModal);
  }

  async openImportModal(mode = 'all') {
    this.clearStatus();
    this.openDialog(this.importModal);
    await this.checkCameraAvailability();

    if (mode === 'restore') {
      this.setImportView('restore');
    } else if (mode === 'manual') {
      this.setImportView('manual');
    } else {
      this.setImportView('scan');
    }
  }

  setImportView(view) {
    const validView = ['scan', 'manual', 'restore'].includes(view) ? view : 'scan';
    this.currentImportView = validView;

    const panels = {
      scan: this.qrInputSection,
      manual: this.manualInputSection,
      restore: this.githubRestoreSection
    };
    Object.entries(panels).forEach(([name, panel]) => {
      if (!panel) return;
      panel.classList.toggle('hidden', name !== validView);
    });
    this.importViewTabs.forEach((tab) => {
      const active = tab.dataset.importView === validView;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    if (validView === 'scan') {
      if (this.hasCamera) {
        this.qrModeTabs.classList.remove('hidden');
        this.switchQRMode('file');
      } else {
        this.qrModeTabs.classList.add('hidden');
        this.switchQRMode('file');
      }
    } else {
      this.stopCamera();
    }

    if (validView === 'manual') {
      setTimeout(() => this.manualIssuerInput && this.manualIssuerInput.focus(), 0);
    }
    this.updateCloudFetchState();
  }

  closeImportModal() {
    this.stopCamera();
    this.clearStatus();
    if (this.manualForm) this.manualForm.reset();
    if (this.fileInput) this.fileInput.value = '';
    if (this.backupFileInput) this.backupFileInput.value = '';
    this.closeDialog(this.importModal);
  }

  confirmAction(title, message, onConfirm, confirmLabel = 'Confirm') {
    if (!this.confirmOverlay) return;
    this.confirmTitle.textContent = title;
    this.confirmMessage.textContent = message;
    this.confirmProceedBtn.textContent = confirmLabel;
    this.openDialog(this.confirmOverlay);

    const cleanup = () => {
      this.closeDialog(this.confirmOverlay);
      this.confirmCancelBtn.removeEventListener('click', onCancel);
      this.confirmProceedBtn.removeEventListener('click', onProceed);
    };
    const onCancel = () => cleanup();
    const onProceed = async () => {
      cleanup();
      try {
        await onConfirm();
      } catch (error) {
        this.showToast('The action could not be completed', 'error');
      }
    };

    this.confirmCancelBtn.addEventListener('click', onCancel);
    this.confirmProceedBtn.addEventListener('click', onProceed);
    this.confirmCancelBtn.focus();
  }

  updateOrderIcon() {
    const asc = document.getElementById('order-asc');
    const desc = document.getElementById('order-desc');
    const label = document.getElementById('sort-order-text');
    if (!asc || !desc || !label) return;

    const labels = {
      custom: this.sortAscending ? 'First added' : 'Last added',
      name: this.sortAscending ? 'A to Z' : 'Z to A',
      newest: this.sortAscending ? 'Oldest' : 'Newest',
      usage: this.sortAscending ? 'Least used' : 'Most used'
    };
    label.textContent = labels[this.currentSort] || labels.custom;
    asc.classList.toggle('hidden', !this.sortAscending);
    desc.classList.toggle('hidden', this.sortAscending);
    this.sortOrderBtn.setAttribute('aria-label', 'Sort direction: ' + label.textContent + '. Activate to reverse.');
    this.sortOrderBtn.title = 'Sort direction: ' + label.textContent;
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.updateCodes();
    this.timerInterval = setInterval(() => this.updateCodes(), 1000);
  }

  updateCodes() {
    const standardRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (this.globalPeriod) this.globalPeriod.textContent = String(standardRemaining);
    if (this.globalPeriodRing) {
      this.globalPeriodRing.style.setProperty('--period-progress', `${(standardRemaining / 30) * 100}%`);
    }

    document.querySelectorAll('.account-item').forEach((item) => {
      if (item.classList.contains('editing')) return;
      const account = this.accounts.find((entry) => String(entry.id) === item.dataset.id);
      if (!account) return;

      const otpElement = item.querySelector('.account-otp');
      const timeElement = item.querySelector('.account-time');
      const secondsElement = item.querySelector('.account-seconds');
      if (!otpElement) return;

      try {
        const descriptor = this.getOtpDescriptor(account);
        const token = this.privacyMode
          ? '•'.repeat(descriptor.digits)
          : descriptor.otp.generate();
        otpElement.textContent = this.formatOtp(token);
        item.classList.remove('account-invalid');

        if (descriptor.type === 'totp') {
          const elapsed = Math.floor(Date.now() / 1000) % descriptor.period;
          const remaining = descriptor.period - elapsed;
          if (secondsElement) secondsElement.textContent = String(remaining);
          if (timeElement) {
            timeElement.style.setProperty('--period-progress', ((remaining / descriptor.period) * 100) + '%');
            timeElement.setAttribute('aria-label', remaining + ' seconds remaining');
          }
        } else {
          if (secondsElement) secondsElement.textContent = '#' + descriptor.counter;
          if (timeElement) {
            timeElement.style.setProperty('--period-progress', '100%');
            timeElement.setAttribute('aria-label', 'HOTP counter ' + descriptor.counter);
          }
        }
      } catch (error) {
        otpElement.textContent = 'Invalid';
        item.classList.add('account-invalid');
        if (secondsElement) secondsElement.textContent = '—';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
window.AuthenticatorApp = AuthenticatorApp;
