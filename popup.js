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

    // cache dom elements
    this.accountList = document.getElementById('account-list');
    this.searchInput = document.getElementById('search-input');
    this.importBtn = document.getElementById('import-btn');
    this.importModal = document.getElementById('import-modal');
    this.closeModalBtn = document.querySelector('.close-modal');
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
    this.activeProfileEl = document.getElementById('active-profile');
    this.sortOrderBtn = document.getElementById('sort-order-btn');
    this.syncErrorBanner = document.getElementById('sync-error-banner');
    this.fixSyncBtn = document.getElementById('fix-sync-btn');
    
    // confirm overlay elements
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
    this.checkSyncStatus();
  }

  detectIdentity() {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      this.currentEmail = info.email || 'offline-profile';
      if (this.activeProfileEl) this.activeProfileEl.innerText = `Sync: ${this.currentEmail}`;
    });
  }

  async loadAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey, 'privacyMode', 'sortAscending', 'syncError'], (result) => {
        this.accounts = result[this.storageKey] || [];
        this.privacyMode = result.privacyMode || false;
        this.sortAscending = (result.sortAscending !== undefined) ? result.sortAscending : true;
        this.filteredAccounts = [...this.accounts];
        this.syncError = result.syncError || false;
        this.updateOrderIcon();
        resolve();
      });
    });
  }

  async loadGithubConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ghToken', 'ghRepo'], (result) => {
        if (result.ghToken && this.ghTokenInput) this.ghTokenInput.value = result.ghToken;
        if (result.ghRepo && this.ghRepoInput) this.ghRepoInput.value = result.ghRepo;
        resolve();
      });
    });
  }

  async saveAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: this.accounts }, () => {
        resolve();
      });
    });
  }

  setupEventListeners() {
    if (this.searchInput) this.searchInput.addEventListener('input', () => this.applyFiltersAndSort());
    if (this.privacyBtn) this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());

    if (this.exportVaultBtn) {
      this.exportVaultBtn.addEventListener('click', () => {
        if (this.accounts.length === 0) { this.showToast('no data to export'); return; }
        this.confirmAction('Export Vault', 'Download local backup of your 2FA codes?', () => this.exportVault());
      });
    }
    
    if (this.githubSyncBtn) this.githubSyncBtn.addEventListener('click', () => this.syncToGithub());
    if (this.saveGhConfigBtn) this.saveGhConfigBtn.addEventListener('click', () => this.saveGithubConfig());
    if (this.fetchGithubBtn) this.fetchGithubBtn.addEventListener('click', () => this.fetchFromGithub());

    if (this.importSelectedGhBtn) this.importSelectedGhBtn.addEventListener('click', () => this.importFromSelectedProfile());
    if (this.importAllGhBtn) this.importAllGhBtn.addEventListener('click', () => this.importAllFromCloud());

    if (this.fixSyncBtn) {
      this.fixSyncBtn.addEventListener('click', () => {
        this.importModal.classList.remove('hidden');
        document.getElementById('github-config').classList.remove('hidden');
      });
    }

    if (this.sortOrderBtn) {
      this.sortOrderBtn.addEventListener('click', () => {
        this.sortAscending = !this.sortAscending;
        chrome.storage.local.set({ sortAscending: this.sortAscending });
        this.updateOrderIcon();
        this.applyFiltersAndSort();
      });
    }

    if (this.ghTokenInput) {
      this.ghTokenInput.addEventListener('input', () => {
        chrome.storage.local.set({ ghToken: this.ghTokenInput.value.trim() });
      });
    }
    if (this.ghRepoInput) {
      this.ghRepoInput.addEventListener('input', () => {
        chrome.storage.local.set({ ghRepo: this.ghRepoInput.value.trim() });
      });
    }

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

    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener('click', () => {
        if (this.accounts.length === 0) {
          this.showToast('no data to clear'); return;
        }
        this.confirmAction('Destructive Action', 'purge all data? u cant undo this!', () => this.clearAllAccounts());
      });
    }

    const toggleModal = () => {
      this.importModal.classList.toggle('hidden');
      document.getElementById('github-config').classList.add('hidden');
    };
    if (this.importBtn) this.importBtn.addEventListener('click', toggleModal);
    if (this.closeModalBtn) this.closeModalBtn.addEventListener('click', toggleModal);
    window.addEventListener('click', (e) => { if (e.target === this.importModal) toggleModal(); });

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

  checkSyncStatus() {
    if (this.syncError) {
      this.syncErrorBanner.classList.remove('hidden');
    } else {
      this.syncErrorBanner.classList.add('hidden');
    }
  }

  setSyncError(hasError) {
    this.syncError = hasError;
    chrome.storage.local.set({ syncError: hasError });
    this.checkSyncStatus();
  }

  // --- github logic ---

  async saveGithubConfig() {
    const token = this.ghTokenInput.value.trim();
    const repo = this.ghRepoInput.value.trim();
    if (!token || !repo) { this.showToast('missing fields'); return; }
    await chrome.storage.local.set({ ghToken: token, ghRepo: repo });
    document.getElementById('github-config').classList.add('hidden');
    this.showToast('config saved sucsesfully');
    this.setSyncError(false); // reset error on new config
    this.syncToGithub();
  }

  async syncToGithub() {
    const { ghToken, ghRepo } = await chrome.storage.local.get(['ghToken', 'ghRepo']);
    if (!ghToken || !ghRepo) {
      this.importModal.classList.remove('hidden');
      document.getElementById('github-config').classList.remove('hidden');
      return;
    }

    this.showToast('syncing to cloude...');
    chrome.runtime.sendMessage({ action: 'githubSync', data: this.accounts }, (res) => {
      if (res && res.success) {
        this.showToast('vault synched!');
        this.setSyncError(false);
      } else {
        this.showToast('sync faild: ' + (res ? res.error : 'timeout'));
        this.setSyncError(true);
      }
    });
  }

  async fetchFromGithub() {
    const { ghToken, ghRepo } = await chrome.storage.local.get(['ghToken', 'ghRepo']);
    if (!ghToken || !ghRepo) { this.showToast('setup github first'); return; }
    this.showToast('fetching profiles...');
    const url = `https://api.github.com/repos/${ghRepo}/contents/profiles`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
      if (res.ok) {
        const files = await res.json();
        this.loadedProfiles = [];
        for(let f of files) {
          if (f.name.endsWith('.json')) {
            const dataRes = await fetch(f.download_url);
            const profileData = await dataRes.json();
            this.loadedProfiles.push(profileData);
          }
        }
        this.renderProfileSelection();
      } else { this.showToast('no cloud profiles found'); }
    } catch (e) { this.showToast('network error'); }
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
    if (this.selectedProfileIndex === undefined) { this.showToast('select profile first'); return; }
    const profile = this.loadedProfiles[this.selectedProfileIndex];
    let addedCount = 0;
    profile.accounts.forEach(acc => { if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) addedCount++; });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.showToast(`imported ${addedCount} accounts`);
    this.syncToGithub(); // sync back to current profile
  }

  importAllFromCloud() {
    let addedCount = 0;
    this.loadedProfiles.forEach(profile => {
      profile.accounts.forEach(acc => { if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) addedCount++; });
    });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.showToast(`merged ${addedCount} accounts from all profiles`);
    this.syncToGithub(); // sync back to current profile
  }

  addAccountNoRender(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) return false;
    this.accounts.push({ id: Date.now() + Math.random(), secret, issuer, label, uri, lastUsed: 0 });
    return true;
  }

  // --- core logic ---

  handleFileSelect(e) { const file = e.target.files[0]; if (file) this.processFile(file); }

  async processFile(file) {
    if (!file || !file.type.startsWith('image/')) { this.showStatus('Not an image.', 'error'); return; }
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
        else this.showStatus('QR not found.', 'error');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleQRCode(uri) {
    try {
      const totp = OTPAuth.URI.parse(uri);
      const added = this.addAccount(totp.secret.base32, totp.issuer || 'Other', totp.label || 'Login', uri);
      if (added) { this.showStatus('Success!', 'success'); setTimeout(() => this.importModal.classList.add('hidden'), 1000); }
    } catch (e) { this.showStatus('Format error.', 'error'); }
  }

  addAccount(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) return false;
    this.accounts.push({ id: Date.now(), secret, issuer, label, uri, lastUsed: 0 });
    this.applyFiltersAndSort(); this.saveAccounts();
    this.syncToGithub(); // auto sync on add
    return true;
  }

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

  startTimer() { this.updateCodes(); setInterval(() => this.updateCodes(), 1000); }

  updateCodes() {
    const progress = ((30 - (Math.floor(Date.now() / 1000) % 30)) / 30) * 100;
    if (this.progressBar) this.progressBar.style.width = `${progress}%`;
    document.querySelectorAll('.account-item').forEach(item => {
      const acc = this.accounts.find(a => a.id == item.dataset.id);
      if (acc) {
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        item.querySelector('.account-otp').innerText = totp.generate().replace(/(\d{3})/, '$1 ');
      }
    });
  }

  render() {
    if (!this.accountList) return;
    this.accountList.classList.toggle('privacy-enabled', this.privacyMode);
    if (this.filteredAccounts.length === 0) {
      this.accountList.innerHTML = '<div class="empty-state">Nothing found.</div>';
      return;
    }
    this.accountList.innerHTML = '';
    this.filteredAccounts.forEach(acc => {
      const el = document.createElement('div');
      el.className = 'account-item'; el.dataset.id = acc.id;
      el.innerHTML = `<div class="account-info"><span class="account-label">${acc.label}</span><span class="account-issuer">${acc.issuer}</span></div><div class="account-otp">--- ---</div>`;
      el.onclick = () => {
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        navigator.clipboard.writeText(totp.generate());
        this.showToast('copid to clipboard');
        acc.lastUsed = Date.now();
        this.saveAccounts();
      };
      this.accountList.appendChild(el);
    });
  }

  togglePrivacyMode() { this.privacyMode = !this.privacyMode; chrome.storage.local.set({ privacyMode: this.privacyMode }); this.render(); }
  showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg; if (this.toastContainer) this.toastContainer.appendChild(t); setTimeout(() => t.remove(), 2500); }
  showStatus(msg, type) { if (this.statusMsg) { this.statusMsg.innerText = msg; this.statusMsg.className = `status-message status-${type}`; this.statusMsg.style.display = 'block'; } }
  clearAllAccounts() { this.accounts = []; this.saveAccounts(); this.render(); this.syncToGithub(); }
  exportVault() {
    const backupData = JSON.stringify(this.accounts, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `auth_vault_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    this.showToast('vault exported safely');
  }
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
