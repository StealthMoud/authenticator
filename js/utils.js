/* global AuthenticatorApp, OTPAuth */

AuthenticatorApp.prototype.escapeHtml = function(value) {
  const node = document.createElement('div');
  node.textContent = String(value == null ? '' : value);
  return node.innerHTML;
};

AuthenticatorApp.prototype.storageGet = function(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      resolve({});
    }
  });
};

AuthenticatorApp.prototype.storageSet = function(values) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
};

AuthenticatorApp.prototype.storageRemove = function(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
};

AuthenticatorApp.prototype.sendRuntimeMessage = function(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message || 'Extension service unavailable' });
          return;
        }
        resolve(response || { success: false, error: 'No response from extension service' });
      });
    } catch (error) {
      resolve({ success: false, error: 'Extension service unavailable' });
    }
  });
};

AuthenticatorApp.prototype.hasGithubPermission = function() {
  if (!chrome.permissions || typeof chrome.permissions.contains !== 'function') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['https://api.github.com/*'] }, (granted) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
};

AuthenticatorApp.prototype.requestGithubPermission = function() {
  if (!chrome.permissions || typeof chrome.permissions.request !== 'function') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: ['https://api.github.com/*'] }, (granted) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
};

AuthenticatorApp.prototype.removeGithubPermission = function() {
  if (!chrome.permissions || typeof chrome.permissions.remove !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    chrome.permissions.remove({ origins: ['https://api.github.com/*'] }, (removed) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(removed));
    });
  });
};

AuthenticatorApp.prototype.togglePrivacyMode = async function() {
  this.privacyMode = !this.privacyMode;
  if (this.privacyMode) this.editingAccountId = null;
  await this.storageSet({ privacyMode: this.privacyMode });
  this.render();
  this.showToast(this.privacyMode ? 'Account details hidden' : 'Account details visible');
};

AuthenticatorApp.prototype.showToast = function(message, type = 'neutral') {
  if (!this.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = String(message);
  this.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-leaving');
    setTimeout(() => toast.remove(), 180);
  }, 2600);
};

AuthenticatorApp.prototype.showStatus = function(message, type, duration = 4200) {
  if (!this.statusMsg) return;
  if (this.statusTimer) clearTimeout(this.statusTimer);

  this.statusMsg.textContent = message;
  this.statusMsg.className = 'status-message status-' + type;
  this.statusMsg.classList.remove('fade-out');

  if (duration > 0) {
    this.statusTimer = setTimeout(() => {
      this.statusMsg.classList.add('fade-out');
      setTimeout(() => this.clearStatus(), 180);
    }, duration);
  }
};

AuthenticatorApp.prototype.clearStatus = function() {
  if (this.statusTimer) {
    clearTimeout(this.statusTimer);
    this.statusTimer = null;
  }
  if (!this.statusMsg) return;
  this.statusMsg.textContent = '';
  this.statusMsg.className = 'status-message';
};

AuthenticatorApp.prototype.openDialog = function(modal) {
  if (!modal || !modal.classList.contains('hidden')) return;
  if (!this.dialogFocusStack) this.dialogFocusStack = [];
  this.dialogFocusStack.push(document.activeElement);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const content = modal.querySelector('.modal-content');
  setTimeout(() => {
    if (content
      && !modal.classList.contains('hidden')
      && !modal.contains(document.activeElement)) {
      content.focus();
    }
  }, 0);
};

AuthenticatorApp.prototype.closeDialog = function(modal) {
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const focusTarget = this.dialogFocusStack && this.dialogFocusStack.pop();
  if (focusTarget && typeof focusTarget.focus === 'function' && document.contains(focusTarget)) {
    focusTarget.focus();
  }
};

AuthenticatorApp.prototype.setupResizeHandler = function() {
  const edges = [
    { element: document.getElementById('resize-edge-left'), type: 'left' },
    { element: document.getElementById('resize-edge-right'), type: 'right' },
    { element: document.getElementById('resize-edge-bottom'), type: 'bottom' }
  ].filter((entry) => entry.element);

  this.storageGet(['popupWidth', 'popupHeight']).then((stored) => {
    const width = Math.max(400, Math.min(800, Number(stored.popupWidth) || 420));
    const height = Math.max(520, Math.min(600, Number(stored.popupHeight) || 600));
    document.body.style.width = width + 'px';
    document.body.style.height = height + 'px';
  });

  const bindResize = (edge, type) => {
    edge.addEventListener('mousedown', (event) => {
      event.preventDefault();
      edge.classList.add('dragging');
      const startWidth = document.body.clientWidth;
      const startHeight = document.body.clientHeight;
      const startX = event.clientX;
      const startY = event.clientY;

      const onMouseMove = (moveEvent) => {
        if (type === 'left') {
          document.body.style.width = Math.max(400, Math.min(800, startWidth - (moveEvent.clientX - startX))) + 'px';
        } else if (type === 'right') {
          document.body.style.width = Math.max(400, Math.min(800, startWidth + (moveEvent.clientX - startX))) + 'px';
        } else {
          document.body.style.height = Math.max(520, Math.min(600, startHeight + (moveEvent.clientY - startY))) + 'px';
        }
      };

      const onMouseUp = async () => {
        edge.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        await this.storageSet({
          popupWidth: document.body.clientWidth,
          popupHeight: document.body.clientHeight
        });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };

  edges.forEach(({ element, type }) => bindResize(element, type));
};

AuthenticatorApp.prototype.getIssuerIcon = function(issuer) {
  const clean = String(issuer || '').toLowerCase().trim();
  const aliases = [
    [['google'], 'google'],
    [['github'], 'github'],
    [['instagram', 'intagram'], 'instagram'],
    [['discord'], 'discord'],
    [['microsoft', 'outlook', 'azure', 'live.com'], 'microsoft'],
    [['slack'], 'slack'],
    [['facebook'], 'facebook'],
    [['twitter', 'x.com'], 'x'],
    [['twitch'], 'twitch'],
    [['gitlab'], 'gitlab'],
    [['steam'], 'steam'],
    [['epic'], 'epic'],
    [['reddit'], 'reddit'],
    [['bitbucket'], 'bitbucket'],
    [['digitalocean', 'digital ocean'], 'digitalocean'],
    [['heroku'], 'heroku'],
    [['cloudflare'], 'cloudflare'],
    [['openai', 'chatgpt'], 'openai'],
    [['zoom'], 'zoom'],
    [['spotify'], 'spotify'],
    [['paypal'], 'paypal'],
    [['stripe'], 'stripe'],
    [['adobe'], 'adobe'],
    [['linkedin'], 'linkedin'],
    [['yahoo'], 'yahoo'],
    [['amazon', 'aws'], 'amazon'],
    [['apple'], 'apple'],
    [['coinbase'], 'coinbase'],
    [['binance'], 'binance'],
    [['voorivex'], 'voorivex'],
    [['hackerone'], 'hackerone'],
    [['bugcrowd'], 'bugcrowd'],
    [['intigriti'], 'intigriti'],
    [['yeswehack'], 'yeswehack'],
    [['synack'], 'synack'],
    [['notion'], 'notion'],
    [['ngrok'], 'ngrok']
  ];
  const match = aliases.find(([terms]) => terms.some((term) => clean === term || clean.includes(term)));
  const key = match && match[1];

  if (key && window.BRAND_ICONS && window.BRAND_ICONS[key]) {
    const icon = window.BRAND_ICONS[key];
    if (typeof icon === 'object') {
      return '<svg class="brand-icon" aria-hidden="true" viewBox="' + icon.viewBox + '" fill="currentColor">' + icon.html + '</svg>';
    }
    return '<svg class="brand-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="' + icon + '"/></svg>';
  }

  const letter = (clean.match(/[a-z0-9]/i) || ['?'])[0].toUpperCase();
  return '<span class="brand-monogram" aria-hidden="true">' + letter + '</span>';
};

AuthenticatorApp.prototype.inferIssuer = function(label, currentIssuer) {
  const value = String(label || '').trim();
  if (value.includes(':')) return value.split(':')[0].trim();
  if (currentIssuer && String(currentIssuer).toLowerCase() !== 'unknown') return currentIssuer;

  const emailDomain = value.match(/@([a-z0-9.-]+)/i);
  if (emailDomain) {
    const domain = emailDomain[1].split('.')[0];
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : 'Unknown';
  }
  return 'Unknown';
};

AuthenticatorApp.prototype.applyFiltersAndSort = function() {
  const term = this.searchInput ? this.searchInput.value.toLocaleLowerCase().trim() : '';
  let result = this.accounts.filter((account) => {
    const issuer = String(account.issuer || '').toLocaleLowerCase();
    const label = String(account.label || '').toLocaleLowerCase();
    return issuer.includes(term) || label.includes(term);
  });
  const direction = this.sortAscending ? 1 : -1;

  if (this.currentSort === 'name') {
    result.sort((a, b) => {
      const first = (String(a.issuer || '') + ' ' + String(a.label || '')).toLocaleLowerCase();
      const second = (String(b.issuer || '') + ' ' + String(b.label || '')).toLocaleLowerCase();
      return first.localeCompare(second, undefined, { numeric: true }) * direction;
    });
  } else if (this.currentSort === 'newest') {
    result.sort((a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) * direction);
  } else if (this.currentSort === 'usage') {
    result.sort((a, b) => {
      const countDifference = ((a.useCount || 0) - (b.useCount || 0)) * direction;
      if (countDifference !== 0) return countDifference;
      return ((a.lastUsed || 0) - (b.lastUsed || 0)) * direction;
    });
  } else if (!this.sortAscending) {
    result = result.slice().reverse();
  }

  this.filteredAccounts = result;
  this.render();
};

AuthenticatorApp.prototype.getOtpDescriptor = function(account) {
  let otp;
  if (account.uri) {
    otp = OTPAuth.URI.parse(account.uri);
  } else {
    otp = new OTPAuth.TOTP({
      issuer: account.issuer || '',
      label: account.label || 'Account',
      secret: account.secret
    });
  }

  if (otp instanceof OTPAuth.HOTP) {
    return {
      type: 'hotp',
      otp,
      algorithm: otp.algorithm || 'SHA1',
      digits: otp.digits || 6,
      counter: Number(otp.counter) || 0,
      period: 0
    };
  }

  return {
    type: 'totp',
    otp,
    algorithm: otp.algorithm || 'SHA1',
    digits: otp.digits || 6,
    counter: 0,
    period: Number(otp.period) || 30
  };
};

AuthenticatorApp.prototype.formatOtp = function(token) {
  const value = String(token || '');
  const midpoint = Math.ceil(value.length / 2);
  return value.slice(0, midpoint) + ' ' + value.slice(midpoint);
};

AuthenticatorApp.prototype.copyText = async function(value) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.className = 'clipboard-fallback';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Clipboard unavailable');
};

AuthenticatorApp.prototype.formatDate = function(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
};

AuthenticatorApp.prototype.describeRelativeTime = function(value) {
  if (!value) return 'Not yet';
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number(value);
  if (!Number.isFinite(timestamp)) return 'Not yet';

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return seconds + ' sec ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + ' hr ago';
  return this.formatDate(timestamp);
};

AuthenticatorApp.prototype.setSyncBusy = function(isBusy) {
  if (!this.githubSyncBtn) return;
  this.githubSyncBtn.classList.toggle('is-syncing', isBusy);
  this.githubSyncBtn.disabled = isBusy;
  this.githubSyncBtn.setAttribute('aria-busy', String(isBusy));
};
