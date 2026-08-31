/* global AuthenticatorApp, jsQR, OTPAuth, VaultSync */

AuthenticatorApp.prototype.importFromSelectedProfile = async function() {
  if (this.selectedProfileEmails.size === 0) {
    this.showToast('Select at least one profile', 'error');
    return;
  }
  if (this.selectedAccountSecrets.size === 0) {
    this.showToast('Select at least one account', 'error');
    return;
  }

  let addedCount = 0;
  this.loadedProfiles.forEach((profile) => {
    if (!this.selectedProfileEmails.has(profile.email) || !Array.isArray(profile.accounts)) return;
    profile.accounts.forEach((account) => {
      if (!this.selectedAccountSecrets.has(VaultSync.accountKey(account))) return;
      if (this.addAccountNoRender(account.secret, account.issuer, account.label, account.uri, account)) {
        addedCount += 1;
      }
    });
  });

  this.applyFiltersAndSort();
  await this.syncAfterLocalChange();
  this.showToast(addedCount ? 'Imported ' + addedCount + ' accounts' : 'Those accounts are already in this vault', addedCount ? 'success' : 'neutral');
  this.closeImportModal();
};

AuthenticatorApp.prototype.importAllFromCloud = async function() {
  let addedCount = 0;
  this.loadedProfiles.forEach((profile) => {
    if (!Array.isArray(profile.accounts)) return;
    profile.accounts.forEach((account) => {
      if (this.addAccountNoRender(account.secret, account.issuer, account.label, account.uri, account)) {
        addedCount += 1;
      }
    });
  });
  this.applyFiltersAndSort();
  await this.syncAfterLocalChange();
  this.showToast(addedCount ? 'Imported ' + addedCount + ' cloud accounts' : 'Cloud accounts already restored', addedCount ? 'success' : 'neutral');
  this.closeImportModal();
};

AuthenticatorApp.prototype.addAccountNoRender = function(secret, issuer, label, uri, metadata = {}) {
  const normalizedSecret = VaultSync.normalizeSecret(secret);
  if (!VaultSync.isValidSecret(normalizedSecret)) return false;
  if (this.accounts.some((account) => VaultSync.accountKey(account) === normalizedSecret)) return false;

  let cleanLabel = String(label || 'Account').trim().slice(0, 180) || 'Account';
  let cleanIssuer = String(issuer || this.inferIssuer(cleanLabel, 'Unknown')).trim().slice(0, 180) || 'Unknown';
  if (cleanLabel.includes(':') && cleanIssuer.toLowerCase() !== 'unknown') {
    const parts = cleanLabel.split(':');
    if (parts[0].trim().toLowerCase() === cleanIssuer.toLowerCase()) {
      cleanLabel = parts.slice(1).join(':').trim() || 'Account';
    }
  }

  const now = Date.now();
  const normalized = VaultSync.normalizeAccount({
    id: metadata.id || VaultSync.createAccountId(),
    secret: normalizedSecret,
    issuer: cleanIssuer,
    label: cleanLabel,
    uri,
    lastUsed: metadata.lastUsed || 0,
    useCount: metadata.useCount || 0,
    createdAt: metadata.createdAt || now,
    updatedAt: metadata.updatedAt || now
  });
  if (!normalized) return false;

  this.deletedAccountKeys = this.deletedAccountKeys.filter((deletion) => deletion.key !== normalizedSecret);
  this.accounts.push(normalized);
  return true;
};

AuthenticatorApp.prototype.handleFileSelect = function(event) {
  const file = event.target.files && event.target.files[0];
  if (file) this.processFile(file);
};

AuthenticatorApp.prototype.processFile = async function(file) {
  if (!file || !/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type)) {
    this.showStatus('Choose a PNG, JPG, WebP, or GIF image', 'error');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    this.showStatus('The image is larger than 12 MB', 'error');
    return;
  }

  this.showStatus('Reading QR code…', 'loading', 0);
  const reader = new FileReader();
  reader.onerror = () => this.showStatus('The image could not be read', 'error');
  reader.onload = (event) => {
    const image = new Image();
    image.onerror = () => this.showStatus('The image format is not supported', 'error');
    image.onload = () => {
      const code = this.scanImageForQR(image);
      if (code && code.data) {
        this.handleQRCode(code.data);
      } else {
        this.showStatus('No QR code was found in that image', 'error');
      }
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

AuthenticatorApp.prototype.restoreBackupFile = async function(file) {
  if (!file || (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json')) {
    this.showStatus('Choose an Authenticator JSON backup', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    this.showStatus('The backup is larger than 5 MB', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    const inputAccounts = Array.isArray(parsed) ? parsed : parsed && parsed.accounts;
    if (!Array.isArray(inputAccounts)) throw new Error('Invalid backup');
    const sanitized = VaultSync.sanitizeAccounts(inputAccounts);
    if (inputAccounts.length > 0 && sanitized.length === 0) throw new Error('No valid accounts');

    let addedCount = 0;
    sanitized.forEach((account) => {
      if (this.addAccountNoRender(account.secret, account.issuer, account.label, account.uri, account)) {
        addedCount += 1;
      }
    });
    this.applyFiltersAndSort();
    await this.syncAfterLocalChange();
    this.showStatus(
      addedCount ? 'Restored ' + addedCount + ' accounts' : 'Every backup account is already present',
      addedCount ? 'success' : 'neutral'
    );
    if (addedCount) setTimeout(() => this.closeImportModal(), 900);
  } catch (error) {
    this.showStatus('This is not a valid Authenticator backup', 'error');
  }
};

AuthenticatorApp.prototype.handleManualAccount = async function(event) {
  event.preventDefault();
  const secret = VaultSync.normalizeSecret(this.manualSecretInput.value);
  const issuer = this.manualIssuerInput.value.trim() || 'Unknown';
  const label = this.manualLabelInput.value.trim() || 'Account';

  if (!VaultSync.isValidSecret(secret)) {
    this.showStatus('Enter a valid Base32 setup key', 'error');
    this.manualSecretInput.focus();
    return;
  }

  try {
    const otp = new OTPAuth.TOTP({
      issuer,
      label,
      secret,
      algorithm: this.manualAlgorithmInput.value,
      digits: Number(this.manualDigitsInput.value),
      period: Number(this.manualPeriodInput.value)
    });
    if (!this.addAccountNoRender(secret, issuer, label, otp.toString())) {
      this.showStatus('That setup key is already in this vault', 'error');
      return;
    }
    this.applyFiltersAndSort();
    await this.syncAfterLocalChange();
    this.manualForm.reset();
    this.showStatus('Account added', 'success');
    setTimeout(() => this.closeImportModal(), 750);
  } catch (error) {
    this.showStatus('The setup key or OTP settings are invalid', 'error');
  }
};

AuthenticatorApp.prototype.findQRBoundingBox = function(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const rowTransitions = new Int32Array(height);
  const colTransitions = new Int32Array(width);

  const step = 2;
  for (let y = 0; y < height; y += step) {
    let lastVal = (data[(y * width) * 4] + data[(y * width) * 4 + 1] + data[(y * width) * 4 + 2]) > 384 ? 1 : 0;
    for (let x = step; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const val = (data[idx] + data[idx + 1] + data[idx + 2]) > 384 ? 1 : 0;
      if (val !== lastVal) {
        rowTransitions[y]++;
        colTransitions[x]++;
        lastVal = val;
      }
    }
  }

  let maxYTransition = 0;
  for (let y = 0; y < height; y++) {
    if (rowTransitions[y] > maxYTransition) maxYTransition = rowTransitions[y];
  }

  let minY = 0, maxY = height - 1;
  const yThreshold = maxYTransition * 0.25;
  for (let y = 0; y < height; y++) {
    if (rowTransitions[y] >= yThreshold) { minY = y; break; }
  }
  for (let y = height - 1; y >= 0; y--) {
    if (rowTransitions[y] >= yThreshold) { maxY = y; break; }
  }

  let maxXTransition = 0;
  for (let x = 0; x < width; x++) {
    if (colTransitions[x] > maxXTransition) maxXTransition = colTransitions[x];
  }

  let minX = 0, maxX = width - 1;
  const xThreshold = maxXTransition * 0.25;
  for (let x = 0; x < width; x++) {
    if (colTransitions[x] >= xThreshold) { minX = x; break; }
  }
  for (let x = width - 1; x >= 0; x--) {
    if (colTransitions[x] >= xThreshold) { maxX = x; break; }
  }

  const padX = Math.round((maxX - minX) * 0.08);
  const padY = Math.round((maxY - minY) * 0.08);

  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(width - x, (maxX - minX) + padX * 2);
  const h = Math.min(height - y, (maxY - minY) + padY * 2);

  if (w > 30 && h > 30 && w < width * 0.98 && h < height * 0.98) {
    return { x, y, w, h };
  }
  return null;
};

AuthenticatorApp.prototype.scanImageForQR = function(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !img.width || !img.height) return null;

  // Decode large screenshots at a bounded working size to avoid exhausting the popup.
  const maxSourceDimension = 2400;
  const sourceScale = Math.min(1, maxSourceDimension / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * sourceScale));
  canvas.height = Math.max(1, Math.round(img.height * sourceScale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Pass 1: Automatic QR location detection & tight cropping
  const box = this.findQRBoundingBox(imageData);
  if (box) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = box.w;
    cropCanvas.height = box.h;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const cropImgData = cropCtx.getImageData(0, 0, box.w, box.h);
    let code = jsQR(cropImgData.data, box.w, box.h);
    if (code) return code;

    // Pass 1b: Resized auto-cropped QR box (max 600px)
    if (box.w > 600 || box.h > 600) {
      const scale = Math.min(600 / box.w, 600 / box.h);
      const scaledW = Math.round(box.w * scale);
      const scaledH = Math.round(box.h * scale);
      const scaleCanvas = document.createElement('canvas');
      scaleCanvas.width = scaledW;
      scaleCanvas.height = scaledH;
      const scaleCtx = scaleCanvas.getContext('2d', { willReadFrequently: true });
      scaleCtx.drawImage(cropCanvas, 0, 0, box.w, box.h, 0, 0, scaledW, scaledH);
      const scaledData = scaleCtx.getImageData(0, 0, scaledW, scaledH);
      code = jsQR(scaledData.data, scaledW, scaledH);
      if (code) return code;
    }

    // Pass 1c: High-contrast binarization of cropped QR box
    const binData = cropCtx.getImageData(0, 0, box.w, box.h);
    const bd = binData.data;
    for (let i = 0; i < bd.length; i += 4) {
      const lum = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
      const val = lum < 128 ? 0 : 255;
      bd[i] = val; bd[i + 1] = val; bd[i + 2] = val;
    }
    code = jsQR(binData.data, box.w, box.h);
    if (code) return code;
  }

  // Pass 2: Full Original Size
  let code = jsQR(imageData.data, canvas.width, canvas.height);
  if (code) return code;

  // Pass 3: Downscaled Max 800px
  const maxDim = 800;
  if (img.width > maxDim || img.height > maxDim) {
    const scale = Math.min(maxDim / img.width, maxDim / img.height);
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.round(img.width * scale);
    scaledCanvas.height = Math.round(img.height * scale);
    const sCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(img, 0, 0, scaledCanvas.width, scaledCanvas.height);
    const sData = sCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
    code = jsQR(sData.data, scaledCanvas.width, scaledCanvas.height);
    if (code) return code;
  }

  // Pass 4: Inverted Colors (for dark mode QR codes)
  const invCanvas = document.createElement('canvas');
  invCanvas.width = canvas.width;
  invCanvas.height = canvas.height;
  const invCtx = invCanvas.getContext('2d');
  invCtx.drawImage(canvas, 0, 0);
  const invImageData = invCtx.getImageData(0, 0, invCanvas.width, invCanvas.height);
  const d = invImageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  code = jsQR(invImageData.data, invCanvas.width, invCanvas.height);
  if (code) return code;

  return null;
};

AuthenticatorApp.prototype.handleQRCode = function(rawUri) {
  if (!rawUri) return;
  const uri = rawUri.trim();

  // 1. Google Authenticator Migration format (otpauth-migration://...)
  if (uri.toLowerCase().startsWith('otpauth-migration://')) {
    this.handleMigrationQRCode(uri);
    return;
  }

  // 2. Standard or Custom otpauth:// format
  if (uri.toLowerCase().startsWith('otpauth://')) {
    this.parseAndAddOtpAuthUri(uri);
    return;
  }

  // 3. Setup URL with secret query parameter (http / https)
  if (uri.toLowerCase().startsWith('http://') || uri.toLowerCase().startsWith('https://')) {
    try {
      const url = new URL(uri);
      const secretParam = url.searchParams.get('secret') || url.searchParams.get('key') || url.searchParams.get('secret_key');
      if (secretParam) {
        const cleanSecret = VaultSync.normalizeSecret(secretParam);
        if (!VaultSync.isValidSecret(cleanSecret)) {
          this.showStatus('The setup URL contains an invalid Base32 key', 'error');
          return;
        }
        const issuer = url.searchParams.get('issuer') || this.inferIssuer(url.hostname, 'Unknown');
        const label = url.searchParams.get('account') || url.searchParams.get('user') || 'Account';
        const digitsParam = url.searchParams.get('digits');
        const periodParam = url.searchParams.get('period');
        const otp = new OTPAuth.TOTP({
          secret: cleanSecret,
          issuer,
          label,
          algorithm: url.searchParams.get('algorithm') || 'SHA1',
          digits: digitsParam == null ? 6 : Number(digitsParam),
          period: periodParam == null ? 30 : Number(periodParam)
        });
        const safeUri = VaultSync.normalizeOtpUri(otp.toString(), cleanSecret);
        if (!safeUri) {
          this.showStatus('The setup URL contains unsupported OTP settings', 'error');
          return;
        }
        const added = this.addAccount(cleanSecret, issuer, label, safeUri);
        if (added) {
          this.showStatus('Account added', 'success');
          setTimeout(() => this.closeImportModal(), 800);
        } else {
          this.showStatus('Account already exists', 'error');
        }
        return;
      }
    } catch (error) {
      this.showStatus('The setup URL is not valid', 'error');
      return;
    }
  }

  // 4. Raw Base32 Secret Key (e.g. "JBSWY3DPEHPK3PXP" or "JBSW Y3DP EHPK 3PXP")
  const cleanRaw = VaultSync.normalizeSecret(uri);
  if (VaultSync.isValidSecret(cleanRaw)) {
    const added = this.addAccount(cleanRaw, 'Imported', 'Account', `otpauth://totp/Account?secret=${cleanRaw}`);
    if (added) {
      this.showStatus('Account added', 'success');
      setTimeout(() => this.closeImportModal(), 800);
    } else {
      this.showStatus('Account already exists', 'error');
    }
    return;
  }

  // 5. Fallback regex search for secret parameter in any URI string
  const secretMatch = uri.match(/[?&]secret=([A-Za-z2-7=]+)/i);
  if (secretMatch) {
    const cleanSecret = VaultSync.normalizeSecret(secretMatch[1]);
    if (!VaultSync.isValidSecret(cleanSecret)) {
      this.showStatus('Invalid QR code: unsupported setup key', 'error');
      return;
    }
    const issuerMatch = uri.match(/[?&]issuer=([^&]+)/i);
    let issuer = 'Unknown';
    try {
      issuer = issuerMatch ? decodeURIComponent(issuerMatch[1]).trim() : 'Unknown';
    } catch (error) {}
    const fallbackOtp = new OTPAuth.TOTP({ secret: cleanSecret, issuer, label: 'Account' });
    const added = this.addAccount(cleanSecret, issuer, 'Account', fallbackOtp.toString());
    if (added) {
      this.showStatus('Account added', 'success');
      setTimeout(() => this.closeImportModal(), 800);
    } else {
      this.showStatus('Account already exists', 'error');
    }
    return;
  }

  this.showStatus('Invalid QR code format', 'error');
};

AuthenticatorApp.prototype.parseAndAddOtpAuthUri = function(uri) {
  let secret = '';
  let issuer = '';
  let label = '';

  // 1. Try OTPAuth library parser
  try {
    const totp = OTPAuth.URI.parse(uri);
    if (totp && totp.secret) {
      secret = totp.secret.base32 || '';
    }
    if (totp && totp.label) {
      label = totp.label;
    }
    if (totp && totp.issuer) {
      issuer = totp.issuer;
    }
  } catch (e) {}

  // 2. Manual regex extraction if OTPAuth parser failed to extract secret
  if (!secret) {
    const secretMatch = uri.match(/[?&]secret=([A-Za-z2-7=]+)/i);
    if (secretMatch) {
      secret = VaultSync.normalizeSecret(secretMatch[1]);
    }
  }

  secret = VaultSync.normalizeSecret(secret);
  if (!VaultSync.isValidSecret(secret)) {
    this.showStatus('Invalid QR code: missing secret key', 'error');
    return;
  }

  const safeUri = VaultSync.normalizeOtpUri(uri, secret);
  if (!safeUri) {
    this.showStatus('Invalid or unsupported OTP settings in QR code', 'error');
    return;
  }

  // 3. Extract query issuer if present
  let queryIssuer = '';
  try {
    const parsedUrl = new URL(uri);
    queryIssuer = (parsedUrl.searchParams.get('issuer') || '').trim();
  } catch (err) {
    const match = uri.match(/[?&]issuer=([^&]+)/i);
    if (match) queryIssuer = decodeURIComponent(match[1]).trim();
  }

  // 4. Extract path label if empty
  if (!label) {
    const pathMatch = uri.match(/otpauth:\/\/(?:totp|hotp)\/([^?]+)/i);
    if (pathMatch) {
      try {
        label = decodeURIComponent(pathMatch[1]).trim();
      } catch (error) {
        this.showStatus('Invalid account label in QR code', 'error');
        return;
      }
    } else {
      label = 'Account';
    }
  }

  let finalIssuer = queryIssuer || issuer || this.inferIssuer(label, 'Unknown');

  // Clean up label if it contains issuer prefix
  if (label.includes(':') && finalIssuer && finalIssuer.toLowerCase() !== 'unknown') {
    const parts = label.split(':');
    if (parts[0].trim().toLowerCase() === finalIssuer.toLowerCase()) {
      label = parts.slice(1).join(':').trim();
    }
  }

  const added = this.addAccount(secret, finalIssuer, label, safeUri);
  if (added) {
    this.showStatus('Account added', 'success');
    setTimeout(() => this.closeImportModal(), 800);
  } else {
    this.showStatus('Account already exists', 'error');
  }
};

/* ==================== Google Authenticator Migration Decoder ==================== */

AuthenticatorApp.prototype.handleMigrationQRCode = async function(uri) {
  try {
    let dataStr = '';
    try {
      const parsedUrl = new URL(uri);
      dataStr = parsedUrl.searchParams.get('data') || '';
    } catch (err) {
      const match = uri.match(/[?&]data=([^&]+)/i);
      if (match) dataStr = decodeURIComponent(match[1]);
    }

    if (!dataStr) {
      this.showStatus('Invalid migration payload in QR code', 'error');
      return;
    }

    let cleanData = dataStr.replace(/[\s\r\n]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (cleanData.length % 4 !== 0) cleanData += '=';

    let binaryString = '';
    try {
      binaryString = atob(cleanData);
    } catch (b64Err) {
      this.showStatus('Corrupted QR code data', 'error');
      return;
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const accounts = this.parseMigrationPayload(bytes);
    if (!accounts || accounts.length === 0) {
      this.showStatus('No 2FA accounts found in migration payload', 'error');
      return;
    }

    let addedCount = 0;
    accounts.forEach((account) => {
      if (this.addAccountNoRender(account.secret, account.issuer, account.label, account.uri)) {
        addedCount += 1;
      }
    });

    if (addedCount > 0) {
      this.applyFiltersAndSort();
      await this.syncAfterLocalChange();
      this.showStatus('Imported ' + addedCount + ' accounts from the QR code', 'success');
      setTimeout(() => this.closeImportModal(), 1000);
    } else {
      this.showStatus('All accounts in QR code already exist', 'error');
    }
  } catch (err) {
    this.showStatus('Failed to decode Google Authenticator QR code', 'error');
  }
};

AuthenticatorApp.prototype.parseVarint = function(buffer, offset) {
  let value = 0;
  let multiplier = 1;
  let bytesRead = 0;

  while (offset < buffer.length && bytesRead < 10) {
    const byte = buffer[offset++];
    value += (byte & 0x7f) * multiplier;
    bytesRead += 1;
    if (!Number.isSafeInteger(value)) return { value: 0, offset, valid: false };
    if ((byte & 0x80) === 0) return { value, offset, valid: true };
    multiplier *= 128;
  }

  return { value: 0, offset, valid: false };
};

AuthenticatorApp.prototype.parseMigrationPayload = function(buffer) {
  let offset = 0;
  const accounts = [];

  while (offset < buffer.length) {
    const key = this.parseVarint(buffer, offset);
    if (!key.valid) break;
    offset = key.offset;
    const fieldNum = Math.floor(key.value / 8);
    const wireType = key.value % 8;

    if (wireType === 2) {
      const lenRes = this.parseVarint(buffer, offset);
      if (!lenRes.valid) break;
      offset = lenRes.offset;
      const len = lenRes.value;
      const end = offset + len;
      if (len < 0 || end > buffer.length) break;

      if (fieldNum === 1) { // otp_parameters
        const acc = this.parseOtpParameters(buffer.subarray(offset, end));
        if (acc && acc.secret) {
          accounts.push(acc);
        }
      }
      offset = end;
    } else if (wireType === 0) {
      const varRes = this.parseVarint(buffer, offset);
      if (!varRes.valid) break;
      offset = varRes.offset;
    } else {
      break;
    }
  }
  return accounts;
};

AuthenticatorApp.prototype.parseOtpParameters = function(buffer) {
  let offset = 0;
  let secretBytes = null;
  let name = '';
  let issuer = '';
  let algo = 'SHA1';
  let digits = 6;
  let type = 'totp';
  let counter = 0;

  while (offset < buffer.length) {
    const key = this.parseVarint(buffer, offset);
    if (!key.valid) break;
    offset = key.offset;
    const fieldNum = Math.floor(key.value / 8);
    const wireType = key.value % 8;

    if (wireType === 2) {
      const lenRes = this.parseVarint(buffer, offset);
      if (!lenRes.valid) break;
      offset = lenRes.offset;
      const len = lenRes.value;
      if (len < 0 || offset + len > buffer.length) break;
      const data = buffer.subarray(offset, offset + len);
      offset += len;

      if (fieldNum === 1) secretBytes = data;
      else if (fieldNum === 2) name = new TextDecoder().decode(data);
      else if (fieldNum === 3) issuer = new TextDecoder().decode(data);
    } else if (wireType === 0) {
      const varRes = this.parseVarint(buffer, offset);
      if (!varRes.valid) break;
      offset = varRes.offset;
      const val = varRes.value;

      if (fieldNum === 4) {
        if (val === 2) algo = 'SHA256';
        else if (val === 3) algo = 'SHA512';
        else algo = 'SHA1';
      } else if (fieldNum === 5) {
        digits = (val === 2) ? 8 : 6;
      } else if (fieldNum === 6) {
        type = (val === 1) ? 'hotp' : 'totp';
      } else if (fieldNum === 7) {
        counter = val;
      }
    } else {
      break;
    }
  }

  if (!secretBytes || secretBytes.length === 0) return null;

  const secretBase32 = this.base32Encode(secretBytes);
  
  let label = name || 'Account';
  let cleanIssuer = issuer || '';

  // Google Authenticator often puts "Issuer:name" in name parameter
  if (!cleanIssuer && label.includes(':')) {
    const parts = label.split(':');
    cleanIssuer = parts[0].trim();
    label = parts.slice(1).join(':').trim();
  }

  const encodedLabel = encodeURIComponent(cleanIssuer ? `${cleanIssuer}:${label}` : label);
  let uri = `otpauth://${type}/${encodedLabel}?secret=${secretBase32}`;
  if (cleanIssuer) uri += `&issuer=${encodeURIComponent(cleanIssuer)}`;
  if (algo !== 'SHA1') uri += `&algorithm=${algo}`;
  if (digits !== 6) uri += `&digits=${digits}`;
  if (type === 'hotp') uri += `&counter=${counter}`;

  return {
    secret: secretBase32,
    issuer: cleanIssuer,
    label: label,
    uri: uri
  };
};

AuthenticatorApp.prototype.base32Encode = function(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
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
};


AuthenticatorApp.prototype.addAccount = function(secret, issuer, label, uri, metadata = {}) {
  const added = this.addAccountNoRender(secret, issuer, label, uri, metadata);
  if (!added) return false;
  this.applyFiltersAndSort();
  this.syncAfterLocalChange();
  return true;
};

/* ==================== Camera Access & Scanning ==================== */

AuthenticatorApp.prototype.checkCameraAvailability = async function() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    this.hasCamera = false;
    this.cameraPermissionState = 'unavailable';
    return false;
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        this.cameraPermissionState = permission.state;
      } catch (error) {
        this.cameraPermissionState = 'prompt';
      }
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    this.hasCamera = videoDevices.length > 0;
    return this.hasCamera;
  } catch (err) {
    this.hasCamera = false;
    return false;
  }
};

AuthenticatorApp.prototype.switchQRMode = function(mode) {
  const selectedMode = mode === 'camera' && this.hasCamera ? 'camera' : 'file';
  this.currentQRMode = selectedMode;

  if (this.qrTabCamera && this.qrTabFile) {
    this.qrTabCamera.classList.toggle('active', selectedMode === 'camera');
    this.qrTabFile.classList.toggle('active', selectedMode === 'file');
    this.qrTabCamera.setAttribute('aria-pressed', String(selectedMode === 'camera'));
    this.qrTabFile.setAttribute('aria-pressed', String(selectedMode === 'file'));
  }

  if (selectedMode === 'camera') {
    if (this.dropZone) this.dropZone.classList.add('hidden');
    if (this.cameraZone) this.cameraZone.classList.remove('hidden');
    if (this.cameraPermissionState === 'granted') {
      this.startCamera();
    } else {
      if (this.cameraActiveView) this.cameraActiveView.classList.add('hidden');
      if (this.cameraPermissionNotice) this.cameraPermissionNotice.classList.remove('hidden');
    }
  } else {
    this.stopCamera();
    if (this.cameraZone) this.cameraZone.classList.add('hidden');
    if (this.dropZone) this.dropZone.classList.remove('hidden');
  }
};

AuthenticatorApp.prototype.startCamera = async function(deviceId = null) {
  this.stopCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    this.showStatus('Camera access not supported by browser', 'error');
    this.switchQRMode('file');
    return;
  }

  try {
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.cameraStream = stream;
    this.cameraPermissionState = 'granted';

    if (this.cameraPermissionNotice) this.cameraPermissionNotice.classList.add('hidden');
    if (this.cameraActiveView) this.cameraActiveView.classList.remove('hidden');

    if (this.cameraStreamEl) {
      this.cameraStreamEl.srcObject = stream;
      await this.cameraStreamEl.play();
    }

    // Populate camera selector if multiple cameras exist
    this.populateCameraDevices();

    // Start frame loop
    this.scanCameraFrame();
  } catch (error) {
    this.cameraPermissionState = error && error.name === 'NotFoundError' ? 'unavailable' : 'denied';
    if (this.cameraActiveView) this.cameraActiveView.classList.add('hidden');
    if (this.cameraPermissionNotice) this.cameraPermissionNotice.classList.remove('hidden');
  }
};

AuthenticatorApp.prototype.populateCameraDevices = async function() {
  if (!this.cameraSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    if (videoDevices.length > 1) {
      this.cameraSelect.innerHTML = '';
      videoDevices.forEach((dev, index) => {
        const option = document.createElement('option');
        option.value = dev.deviceId;
        option.textContent = dev.label || `Camera ${index + 1}`;
        this.cameraSelect.appendChild(option);
      });
      this.cameraSelect.classList.remove('hidden');
    } else {
      this.cameraSelect.classList.add('hidden');
    }
  } catch (e) {
    // Ignore dropdown errors
  }
};

AuthenticatorApp.prototype.stopCamera = function() {
  if (this.cameraAnimFrame) {
    cancelAnimationFrame(this.cameraAnimFrame);
    this.cameraAnimFrame = null;
  }

  if (this.cameraStream) {
    this.cameraStream.getTracks().forEach(track => track.stop());
    this.cameraStream = null;
  }

  if (this.cameraStreamEl) {
    this.cameraStreamEl.srcObject = null;
  }
};

AuthenticatorApp.prototype.scanCameraFrame = function() {
  if (!this.cameraStream || this.currentQRMode !== 'camera') return;

  const video = this.cameraStreamEl;
  const now = performance.now();
  if (video && video.readyState === video.HAVE_ENOUGH_DATA && now - this.lastCameraScanAt >= 120) {
    this.lastCameraScanAt = now;
    if (!this.cameraCanvas) {
      this.cameraCanvas = document.createElement('canvas');
    }
    const canvas = this.cameraCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code && code.data) {
      this.stopCamera();
      this.handleQRCode(code.data);
      return;
    }
  }

  this.cameraAnimFrame = requestAnimationFrame(() => this.scanCameraFrame());
};
