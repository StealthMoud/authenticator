/* global jsQR, OTPAuth */

class AuthenticatorApp {
  constructor() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.timerInterval = null;
    this.storageKey = 'authenticator_accounts';

    // Elements
    this.accountList = document.getElementById('account-list');
    this.searchInput = document.getElementById('search-input');
    this.importBtn = document.getElementById('import-btn');
    this.addFirstBtn = document.getElementById('add-first-btn');
    this.importModal = document.getElementById('import-modal');
    this.closeModalBtn = document.querySelector('.close-modal');
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.statusMsg = document.getElementById('import-status');
    this.progressBar = document.getElementById('global-timer');
    this.clearAllBtn = document.getElementById('clear-all-btn');

    this.init();
  }

  async init() {
    await this.loadAccounts();
    this.setupEventListeners();
    this.startTimer();
    this.render();
  }

  async loadAccounts() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        this.accounts = result[this.storageKey] || [];
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
    // Search
    this.searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      this.filteredAccounts = this.accounts.filter(acc => 
        (acc.issuer && acc.issuer.toLowerCase().includes(term)) || 
        (acc.label && acc.label.toLowerCase().includes(term))
      );
      this.render();
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
    this.importBtn.addEventListener('click', toggleModal);
    this.addFirstBtn.addEventListener('click', toggleModal);
    this.closeModalBtn.addEventListener('click', toggleModal);
    
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
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!img.width || !img.height) {
            throw new Error('Invalid image dimensions');
          }

          let width = Math.floor(img.width);
          let height = Math.floor(img.height);
          
          if (width <= 0 || height <= 0) {
            throw new Error('Image has zero dimensions');
          }

          const maxDim = 1500;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          const imageData = ctx.getImageData(0, 0, width, height);
          if (!imageData || !imageData.data || imageData.data.length === 0) {
            throw new Error('Could not access image pixels');
          }

          // Force integer dimensions from the actual extracted data
          const finalWidth = Math.floor(imageData.width);
          const finalHeight = Math.floor(imageData.height);

          // Pass 1: Normal scan
          let codeArr = jsQR(imageData.data, finalWidth, finalHeight, { 
            inversionAttempts: "dontInvert" 
          });

          // Pass 2: Inverted scan (Dark mode)
          if (!codeArr) {
            codeArr = jsQR(imageData.data, finalWidth, finalHeight, { 
              inversionAttempts: "onlyInvert" 
            });
          }

          // Pass 3: Grayscale + High Contrast Preprocessing
          if (!codeArr) {
            this.showStatus('Enhancing image...', '');
            const data = new Uint8ClampedArray(imageData.data);
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              const val = avg < 128 ? 0 : 255;
              data[i] = data[i+1] = data[i+2] = val;
            }
            codeArr = jsQR(data, finalWidth, finalHeight, { 
              inversionAttempts: "dontInvert" 
            });
          }

          if (codeArr && codeArr.data) {
            console.log('QR Code detected:', codeArr.data);
            this.handleQRCode(codeArr.data);
          } else {
            this.showStatus('No QR code detected. Try a closer screenshot.', 'error');
          }
        } catch (err) {
          console.error('Process Error:', err);
          this.showStatus('Error processing image. Please try again.', 'error');
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
      id: Date.now().toString(),
      uri: uri,
      issuer: issuer,
      label: label,
      secret: secret
    };

    // Check for duplicates
    if (this.accounts.some(a => a.secret === newAccount.secret && a.label === newAccount.label)) {
      this.showStatus('Account already exists.', 'error');
      return false;
    }

    this.accounts.push(newAccount);
    this.filteredAccounts = [...this.accounts];
    this.saveAccounts();
    this.render();
    return true;
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
      const account = this.accounts.find(a => a.id === id);
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
        item.querySelector('.account-otp').textContent = code.slice(0, 3) + ' ' + code.slice(3);
      }
    });
  }

  render() {
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
    this.filteredAccounts.forEach(acc => {
      const item = document.createElement('div');
      item.className = 'account-item';
      item.dataset.id = acc.id;
      
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
        <div class="account-info">
          <span class="account-label">${acc.label}</span>
          <span class="account-issuer">${acc.issuer}</span>
        </div>
        <div class="account-right">
          <div class="account-otp">${displayCode}</div>
          <button class="delete-btn" title="Remove account" data-id="${acc.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      `;

      // Copy code on click (of the item, but not the delete button)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        const cleanCode = code;
        navigator.clipboard.writeText(cleanCode);
        this.showToast('Code copied!');
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
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.filteredAccounts = this.filteredAccounts.filter(a => a.id !== id);
    this.saveAccounts();
    this.render();
    this.showToast('Account removed');
  }

  clearAllAccounts() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.saveAccounts();
    this.render();
    this.showToast('All accounts cleared');
  }

  showToast(msg) {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--primary);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: fadeInOut 2s ease forwards;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    
    // Add animation style if not exists
    if (!document.getElementById('toast-style')) {
      const style = document.createElement('style');
      style.id = 'toast-style';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, 10px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          85% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => toast.remove(), 2000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AuthenticatorApp();
});
