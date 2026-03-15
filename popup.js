/* global jsQR, OTPAuth */

class AuthenticatorApp {
  constructor() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.timerInterval = null;
    this.storageKey = 'authenticator_accounts';
    this.currentSort = 'custom';
    this.privacyMode = false;

    // select elements from the dom
    this.accountList = document.getElementById('account-list');
    this.searchInput = document.getElementById('search-input'); // for filtring accounts
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
    this.gmailBackupBtn = document.getElementById('gmail-backup-btn'); // click for bakcup

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

    // Privacy Mode
    this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());

    // Data Export
    if (this.gmailBackupBtn) {
      this.gmailBackupBtn.addEventListener('click', () => this.exportVault());
    }

    // Sorting
    document.querySelectorAll('.sort-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        this.currentSort = e.target.dataset.sort;
        this.applyFiltersAndSort();
      });
    });

    // Clear All
    this.clearAllBtn.addEventListener('click', () => {
      if (this.accounts.length === 0) {
        this.showToast('No accounts to clear');
        return;
      }
      if (confirm('Are you sure you want to remove ALL accounts? This cannot be undone.')) {
        this.clearAllAccounts();
      }
    });

    // Modal
    const toggleModal = () => this.importModal.classList.toggle('hidden');
    if (this.importBtn) this.importBtn.addEventListener('click', toggleModal);
    if (this.closeModalBtn) this.closeModalBtn.addEventListener('click', toggleModal);
    
    window.addEventListener('click', (e) => {
      if (e.target === this.importModal) toggleModal();
    });

    // File Import
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Drag and Drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.processFile(file);
    });
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.processFile(file);
  }

  async processFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.showStatus('Please upload a valid image file.', 'error');
      return;
    }

    this.showStatus('Processing...', '');

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => this.showStatus('Failed to load image file.', 'error');
      img.onload = () => {
        try {
          const runScan = (w, h, data) => {
            return jsQR(data, Math.floor(w), Math.floor(h), { 
              inversionAttempts: "dontInvert" 
            }) || jsQR(data, Math.floor(w), Math.floor(h), { 
              inversionAttempts: "onlyInvert" 
            });
          };

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          let width = Math.floor(img.width);
          let height = Math.floor(img.height);
          if (width <= 0 || height <= 0) throw new Error('Invalid image size');

          // Try original resolution first (best for dense codes)
          const maxDim = 2500;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          const imageData = ctx.getImageData(0, 0, width, height);
          let codeResult = runScan(width, height, imageData.data);

          // If simple scan fails, try aggressive preprocessing
          if (!codeResult) {
            this.showStatus('Deep scanning...', '');
            
            // Try different contrast thresholds
            const thresholds = [128, 160, 100, 200];
            for (const threshold of thresholds) {
              const binarizedData = new Uint8ClampedArray(imageData.data);
              for (let i = 0; i < binarizedData.length; i += 4) {
                const avg = (binarizedData[i] + binarizedData[i+1] + binarizedData[i+2]) / 3;
                const val = avg < threshold ? 0 : 255;
                binarizedData[i] = binarizedData[i+1] = binarizedData[i+2] = val;
              }
              codeResult = runScan(width, height, binarizedData);
              if (codeResult) break;
            }
          }

          // Last resort: Grayscale (preserving some detail)
          if (!codeResult) {
            const grayData = new Uint8ClampedArray(imageData.data);
            for (let i = 0; i < grayData.length; i += 4) {
              const val = (grayData[i] * 0.299 + grayData[i+1] * 0.587 + grayData[i+2] * 0.114);
              grayData[i] = grayData[i+1] = grayData[i+2] = val;
            }
            codeResult = runScan(width, height, grayData);
          }

          if (codeResult && codeResult.data) {
            this.handleQRCode(codeResult.data);
          } else {
            this.showStatus('Unable to detect QR. Try cropping the code closer.', 'error');
          }
        } catch (err) {
          console.error('Process Error:', err);
          this.showStatus('Scan failed. Please use a clearer screenshot.', 'error');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleQRCode(uri) {
    try {
      if (uri.startsWith('otpauth-migration://')) {
        this.parseMigrationURI(uri);
        return;
      }

      if (!uri.startsWith('otpauth://')) {
        throw new Error('Not a valid OTP URI');
      }

      const totp = OTPAuth.URI.parse(uri);
      const added = this.addAccount(totp.secret.base32, totp.issuer || 'Unknown', totp.label || 'Account', uri);
      
      if (added) {
        this.showStatus('Account added successfully!', 'success');
        this.closeModalDelayed();
      }

    } catch (err) {
      console.error('QR Parse Error:', err);
      this.showStatus('Unsupported QR format or invalid data.', 'error');
    }
  }

  addAccount(secret, issuer, label, uri) {
    const newAccount = {
      id: Date.now(),
      uri: uri,
      issuer: issuer,
      label: label,
      secret: secret,
      lastUsed: 0
    };

    // Check for duplicates
    if (this.accounts.some(a => a.secret === newAccount.secret && a.label === newAccount.label)) {
      this.showStatus('Account already exists.', 'error');
      return false;
    }

    this.accounts.push(newAccount);
    this.applyFiltersAndSort();
    this.saveAccounts();
    return true;
  }

  applyFiltersAndSort() {
    const term = this.searchInput.value.toLowerCase();
    
    // Filter
    let result = this.accounts.filter(acc => 
      (acc.issuer && acc.issuer.toLowerCase().includes(term)) || 
      (acc.label && acc.label.toLowerCase().includes(term))
    );

    // Sort
    if (this.currentSort === 'name') {
      result.sort((a, b) => (a.issuer || '').localeCompare(b.issuer || ''));
    } else if (this.currentSort === 'newest') {
      result.sort((a, b) => b.id - a.id);
    } else if (this.currentSort === 'recent') {
      result.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }
    // 'custom' does not need explicit sorting as it follows this.accounts order

    this.filteredAccounts = result;
    this.render();
  }

  closeModalDelayed() {
    setTimeout(() => {
      this.importModal.classList.add('hidden');
      this.statusMsg.textContent = '';
      this.statusMsg.className = 'status-message';
    }, 1500);
  }

  async parseMigrationURI(uri) {
    try {
      const url = new URL(uri);
      const data = url.searchParams.get('data');
      if (!data) throw new Error('No data param');

      // Manual Protobuf Parsing for Google Authenticator Migration format
      // Base64 decode
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      let pos = 0;
      let accountsAdded = 0;

      // Outer message is repeated OtpParameters (field 1)
      while (pos < bytes.length) {
        const tag = this.readVarint(bytes, pos);
        pos = tag.next;
        const fieldNum = tag.value >> 3;
        const wireType = tag.value & 7;

        if (fieldNum === 1 && wireType === 2) {
          const len = this.readVarint(bytes, pos);
          pos = len.next;
          const end = pos + len.value;
          
          let secret, name, issuer;
          
          while (pos < end) {
            const innerTag = this.readVarint(bytes, pos);
            pos = innerTag.next;
            const innerFieldNum = innerTag.value >> 3;
            const innerWireType = innerTag.value & 7;
            
            const innerLen = this.readVarint(bytes, pos);
            pos = innerLen.next;
            
            if (innerFieldNum === 1) { // secret
              const secretBytes = bytes.slice(pos, pos + innerLen.value);
              secret = this.base32Encode(secretBytes);
              pos += innerLen.value;
            } else if (innerFieldNum === 2) { // name
              name = new TextDecoder().decode(bytes.slice(pos, pos + innerLen.value));
              pos += innerLen.value;
            } else if (innerFieldNum === 3) { // issuer
              issuer = new TextDecoder().decode(bytes.slice(pos, pos + innerLen.value));
              pos += innerLen.value;
            } else {
              pos += innerLen.value;
            }
          }
          
          if (secret) {
            if (this.addAccount(secret, issuer || 'Google', name || 'Account', '')) {
              accountsAdded++;
            }
          }
          pos = end;
        } else {
          // Skip other fields
          if (wireType === 0) pos = this.readVarint(bytes, pos).next;
          else if (wireType === 2) pos += this.readVarint(bytes, pos).value + this.readVarint(bytes, pos).next - pos;
          else pos++; // Minimal skip
        }
      }

      if (accountsAdded > 0) {
        this.showStatus(`Imported ${accountsAdded} accounts!`, 'success');
        this.closeModalDelayed();
      } else {
        this.showStatus('No accounts found in migration data.', 'error');
      }

    } catch (err) {
      console.error('Migration Parse Error:', err);
      this.showStatus('Failed to decode migration data.', 'error');
    }
  }

  readVarint(bytes, pos) {
    let value = 0;
    let shift = 0;
    while (true) {
      const b = bytes[pos++];
      value |= (b & 127) << shift;
      if (!(b & 128)) break;
      shift += 7;
    }
    return { value, next: pos };
  }

  base32Encode(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
  }

  showStatus(msg, type) {
    this.statusMsg.textContent = msg;
    this.statusMsg.className = `status-message status-${type}`;
  }

  startTimer() {
    this.updateCodes();
    this.timerInterval = setInterval(() => {
      this.updateCodes();
    }, 1000);
  }

  updateCodes() {
    const now = Math.floor(Date.now() / 1000);
    const seconds = now % 30;
    const progress = ((30 - seconds) / 30) * 100;
    this.progressBar.style.width = `${progress}%`;

    // Update displayed codes if accounts exist
    const items = document.querySelectorAll('.account-item');
    items.forEach(item => {
      const id = item.dataset.id;
      const account = this.accounts.find(a => a.id == id);
      if (account) {
        const totp = new OTPAuth.TOTP({
            issuer: account.issuer,
            label: account.label,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: account.secret
        });
        const code = totp.generate();
        const codeEl = item.querySelector('.account-otp');
        const newCode = code.slice(0, 3) + ' ' + code.slice(3);
        if (codeEl.textContent !== newCode) {
          codeEl.textContent = newCode;
        }
      }
    });
  }

  render() {
    this.accountList.classList.toggle('privacy-enabled', this.privacyMode);
    this.privacyBtn.classList.toggle('active', this.privacyMode);
    this.privacyBtn.querySelector('.eye-open').classList.toggle('hidden', this.privacyMode);
    this.privacyBtn.querySelector('.eye-closed').classList.toggle('hidden', !this.privacyMode);

    if (this.filteredAccounts.length === 0) {
      this.accountList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
          </div>
          <p>${this.accounts.length > 0 ? 'No matching accounts' : 'No accounts yet'}</p>
          <button id="render-add-btn">Import QR Code</button>
        </div>
      `;
      const btn = document.getElementById('render-add-btn');
      if (btn) btn.addEventListener('click', () => this.importModal.classList.remove('hidden'));
      return;
    }

    this.accountList.innerHTML = '';
    this.filteredAccounts.forEach((acc, index) => {
      const item = document.createElement('div');
      item.className = 'account-item';
      item.dataset.id = acc.id;
      item.style.animationDelay = `${index * 0.05}s`;
      
      const totp = new OTPAuth.TOTP({
          issuer: acc.issuer,
          label: acc.label,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: acc.secret
      });
      const code = totp.generate();
      const displayCode = code.slice(0, 3) + ' ' + code.slice(3);

      item.innerHTML = `
        <div class="drag-handle">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <div class="account-info" title="${acc.issuer}: ${acc.label}">
          <span class="account-label">${acc.label}</span>
          <span class="account-issuer">${acc.issuer}</span>
        </div>
        <div class="account-right">
          <div class="account-otp">${displayCode}</div>
        </div>
        <button class="delete-btn" title="Remove account" data-id="${acc.id}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      // Drag and drop setup (only if no search active)
      if (!this.searchInput.value) {
        item.draggable = true;
        item.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
        item.addEventListener('dragover', (e) => this.handleDragOver(e));
        item.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        item.addEventListener('drop', (e) => this.handleDrop(e, index));
        item.addEventListener('dragend', () => this.handleDragEnd());
      }

      // Copy code on click
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn') || e.target.closest('.drag-handle')) return;
        
        navigator.clipboard.writeText(code);
        
        // Update last used
        acc.lastUsed = Date.now();
        this.saveAccounts();

        // Visual feedback on the code itself
        const otpDisplay = item.querySelector('.account-otp');
        otpDisplay.style.transition = 'none';
        otpDisplay.style.color = 'var(--accent)';
        otpDisplay.style.filter = 'drop-shadow(0 0 10px var(--accent))';
        
        setTimeout(() => {
          otpDisplay.style.transition = 'all 0.5s';
          otpDisplay.style.color = '';
          otpDisplay.style.filter = '';
        }, 300);

        this.showToast('Copied to clipboard');
      });

      // Delete action
      const delBtn = item.querySelector('.delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Remove ${acc.issuer} (${acc.label})?`)) {
          this.deleteAccount(acc.id);
        }
      });

      this.accountList.appendChild(item);
    });
  }

  deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id != id);
    this.applyFiltersAndSort();
    this.saveAccounts();
    this.showToast('Account removed');
  }

  clearAllAccounts() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.saveAccounts();
    this.render();
    this.showToast('All accounts cleared');
  }

  // Drag and Drop Handlers
  handleDragStart(e, index) {
    this.draggedIdx = index;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
    return false;
  }

  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  handleDrop(e, targetIdx) {
    e.preventDefault();
    e.stopPropagation();
    
    if (this.draggedIdx !== targetIdx) {
      const movedItem = this.accounts.splice(this.draggedIdx, 1)[0];
      this.accounts.splice(targetIdx, 0, movedItem);
      
      // Switch to custom sort after manual reorder
      this.currentSort = 'custom';
      document.querySelectorAll('.sort-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.sort === 'custom');
      });

      this.applyFiltersAndSort();
      this.saveAccounts();
      this.showToast('Reordered');
    }
  }

  handleDragEnd() {
    const dragging = document.querySelector('.dragging');
    if (dragging) dragging.classList.remove('dragging');
    document.querySelectorAll('.account-item').forEach(i => i.classList.remove('drag-over'));
  }

  togglePrivacyMode() {
    this.privacyMode = !this.privacyMode;
    chrome.storage.local.set({ privacyMode: this.privacyMode });
    this.render();
    this.showToast(this.privacyMode ? 'Privacy Mode Enabled' : 'Privacy Mode Disabled');
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div style="color: var(--accent)">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <span>${msg}</span>
    `;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  // export accounts to a file
  exportVault() {
    if (this.accounts.length === 0) {
      this.showToast('No data to export');
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

    this.showToast('Vault exported safely');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AuthenticatorApp();
});
