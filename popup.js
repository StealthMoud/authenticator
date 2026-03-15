/* global jsQR, OTPAuth */

class AuthenticatorApp {
  constructor() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.timerInterval = null;
    this.storageKey = 'authenticator_accounts';
    this.currentSort = 'custom';
    this.privacyMode = false;

    // cache dom elements for faster access
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

    this.init();
  }

  async init() {
    await this.loadAccounts();
    this.setupEventListeners();
    this.startTimer();
    this.applyFiltersAndSort();
  }

  async loadAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey, 'privacyMode'], (result) => {
        this.accounts = result[this.storageKey] || [];
        this.privacyMode = result.privacyMode || false;
        this.filteredAccounts = [...this.accounts];
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
    this.searchInput.addEventListener('input', () => this.applyFiltersAndSort());

    // privacy and visibility
    this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());

    // buttons listeners
    if (this.exportVaultBtn) this.exportVaultBtn.addEventListener('click', () => this.exportVault());
    if (this.githubSyncBtn) this.githubSyncBtn.addEventListener('click', () => this.syncToGithub());
    if (this.saveGhConfigBtn) this.saveGhConfigBtn.addEventListener('click', () => this.saveGithubConfig());
    if (this.fetchGithubBtn) this.fetchGithubBtn.addEventListener('click', () => this.fetchFromGithub());

    // sorting chips
    document.querySelectorAll('.sort-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        this.currentSort = e.target.dataset.sort;
        this.applyFiltersAndSort();
      });
    });

    // clear vault
    this.clearAllBtn.addEventListener('click', () => {
      if (this.accounts.length === 0) {
        this.showToast('no data to clear');
        return;
      }
      if (confirm('pruge all data? u cant undo this!')) {
        this.clearAllAccounts();
      }
    });

    // modal controls
    const toggleModal = () => {
      this.importModal.classList.toggle('hidden');
      document.getElementById('github-config').classList.add('hidden'); // hide config on close
    };
    if (this.importBtn) this.importBtn.addEventListener('click', toggleModal);
    if (this.closeModalBtn) this.closeModalBtn.addEventListener('click', toggleModal);
    
    window.addEventListener('click', (e) => {
      if (e.target === this.importModal) toggleModal();
    });

    // drop n drag for files
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.processFile(file);
    });
  }

  // --- github cloud logic ---

  async saveGithubConfig() {
    const token = document.getElementById('gh-token').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    
    if (!token || !repo) {
      this.showToast('missing fields');
      return;
    }

    await chrome.storage.local.set({ ghToken: token, ghRepo: repo });
    document.getElementById('github-config').classList.add('hidden');
    this.showToast('config saved sucsesfully');
    this.syncToGithub(); // trigger sync after save
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
      } else {
        this.showToast('sync faild: ' + (res ? res.error : 'timeout'));
      }
    });
  }

  async fetchFromGithub() {
    const { ghToken, ghRepo } = await chrome.storage.local.get(['ghToken', 'ghRepo']);
    if (!ghToken || !ghRepo) {
      this.showToast('setup github first');
      return;
    }

    this.showToast('fetching vault...');
    const url = `https://api.github.com/repos/${ghRepo}/contents/authenticator_backup.json`;
    
    try {
      const res = await fetch(url, { 
        headers: { 'Authorization': `token ${ghToken}` } 
      });
      
      if (res.ok) {
        const file = await res.json();
        const data = JSON.parse(atob(file.content));
        this.renderGithubRestore(data);
      } else {
        this.showToast('count not find backup file');
      }
    } catch (e) {
      this.showToast('network error');
    }
  }

  renderGithubRestore(remoteAccounts) {
    const container = document.getElementById('github-accounts-list');
    container.innerHTML = '';
    
    if (!remoteAccounts || remoteAccounts.length === 0) {
      container.innerHTML = '<p style="font-size:0.8rem">Vault is empty</p>';
      return;
    }

    this.importAllGhBtn.classList.remove('hidden');
    this.importAllGhBtn.onclick = () => {
      remoteAccounts.forEach(acc => this.addAccount(acc.secret, acc.issuer, acc.label, acc.uri));
      this.showToast('imported everyting');
    };

    remoteAccounts.forEach(acc => {
      const chip = document.createElement('div');
      chip.className = 'sort-chip';
      chip.style.fontSize = '0.7rem';
      chip.innerText = `${acc.issuer}`;
      chip.onclick = () => {
        this.addAccount(acc.secret, acc.issuer, acc.label, acc.uri);
        this.showToast(`added ${acc.issuer}`);
      };
      container.appendChild(chip);
    });
  }

  // --- core auth logic ---

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.processFile(file);
  }

  async processFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.showStatus('Not an image.', 'error');
      return;
    }

    this.showStatus('Scanning...', '');
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        
        if (code) {
          this.handleQRCode(code.data);
        } else {
          this.showStatus('QR not found.', 'error');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleQRCode(uri) {
    try {
      if (!uri.startsWith('otpauth://')) throw new Error('invalid');
      const totp = OTPAuth.URI.parse(uri);
      const added = this.addAccount(totp.secret.base32, totp.issuer || 'Other', totp.label || 'Login', uri);
      if (added) {
        this.showStatus('Success!', 'success');
        setTimeout(() => this.importModal.classList.add('hidden'), 1000);
      }
    } catch (e) {
      this.showStatus('Format error.', 'error');
    }
  }

  addAccount(secret, issuer, label, uri) {
    if (this.accounts.some(a => a.secret === secret)) {
      return false;
    }
    this.accounts.push({ id: Date.now(), secret, issuer, label, uri, lastUsed: 0 });
    this.applyFiltersAndSort();
    this.saveAccounts();
    return true;
  }

  applyFiltersAndSort() {
    const term = this.searchInput.value.toLowerCase();
    let result = this.accounts.filter(a => 
      a.issuer.toLowerCase().includes(term) || a.label.toLowerCase().includes(term)
    );

    if (this.currentSort === 'name') result.sort((a,b) => a.issuer.localeCompare(b.issuer));
    if (this.currentSort === 'newest') result.sort((a,b) => b.id - a.id);
    
    this.filteredAccounts = result;
    this.render();
  }

  startTimer() {
    this.updateCodes();
    setInterval(() => this.updateCodes(), 1000);
  }

  updateCodes() {
    const progress = ((30 - (Math.floor(Date.now() / 1000) % 30)) / 30) * 100;
    this.progressBar.style.width = `${progress}%`;

    document.querySelectorAll('.account-item').forEach(item => {
      const acc = this.accounts.find(a => a.id == item.dataset.id);
      if (acc) {
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        item.querySelector('.account-otp').innerText = totp.generate().replace(/(\d{3})/, '$1 ');
      }
    });
  }

  render() {
    this.accountList.classList.toggle('privacy-enabled', this.privacyMode);
    if (this.filteredAccounts.length === 0) {
      this.accountList.innerHTML = '<div class="empty-state">Nothing found.</div>';
      return;
    }

    this.accountList.innerHTML = '';
    this.filteredAccounts.forEach(acc => {
      const el = document.createElement('div');
      el.className = 'account-item';
      el.dataset.id = acc.id;
      el.innerHTML = `
        <div class="account-info">
          <span class="account-label">${acc.label}</span>
          <span class="account-issuer">${acc.issuer}</span>
        </div>
        <div class="account-otp">--- ---</div>
      `;
      el.onclick = () => {
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        navigator.clipboard.writeText(totp.generate());
        this.showToast('copid to clipboard');
      };
      this.accountList.appendChild(el);
    });
  }

  togglePrivacyMode() {
    this.privacyMode = !this.privacyMode;
    chrome.storage.local.set({ privacyMode: this.privacyMode });
    this.render();
  }

  showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    this.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  showStatus(msg, type) {
    this.statusMsg.innerText = msg;
    this.statusMsg.className = `status-message status-${type}`;
    this.statusMsg.style.display = 'block';
  }

  clearAllAccounts() {
    this.accounts = [];
    this.saveAccounts();
    this.render();
  }

  // export accounts to a file
  exportVault() {
    if (this.accounts.length === 0) {
      this.showToast('no data to export');
      return;
    }

    const backupData = JSON.stringify(this.accounts, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // create a hidden link and click it
    const a = document.createElement('a');
    a.href = url;
    a.download = `auth_vault_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('vault exported safely');
  }
}

document.addEventListener('DOMContentLoaded', () => new AuthenticatorApp());
