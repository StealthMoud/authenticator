/* global AuthenticatorApp, jsQR, OTPAuth */

AuthenticatorApp.prototype.importFromSelectedProfile = function() {
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
};

AuthenticatorApp.prototype.importAllFromCloud = function() {
  let addedCount = 0;
  this.loadedProfiles.forEach(profile => {
    profile.accounts.forEach(acc => { if (this.addAccountNoRender(acc.secret, acc.issuer, acc.label, acc.uri)) addedCount++; });
  });
  this.applyFiltersAndSort(); this.saveAccounts();
  this.showToast(`Merged ${addedCount} accounts from all profiles`);
  this.syncToGithub();
};

AuthenticatorApp.prototype.addAccountNoRender = function(secret, issuer, label, uri) {
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
};

AuthenticatorApp.prototype.handleFileSelect = function(e) {
  const file = e.target.files[0];
  if (file) this.processFile(file);
};

AuthenticatorApp.prototype.processFile = async function(file) {
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
};

AuthenticatorApp.prototype.handleQRCode = function(uri) {
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
};

AuthenticatorApp.prototype.addAccount = function(secret, issuer, label, uri) {
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
};
