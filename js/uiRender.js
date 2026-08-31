/* global AuthenticatorApp, OTPAuth */

AuthenticatorApp.prototype.renderEmptyState = function() {
  const hasAccounts = this.accounts.length > 0;
  const hasCloud = Boolean(this.ghToken && this.ghRepo);

  if (hasAccounts) {
    this.accountList.innerHTML = [
      '<div class="empty-state search-empty">',
      '<div class="empty-symbol" aria-hidden="true">',
      '<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
      '</div>',
      '<p class="empty-eyebrow">No results</p>',
      '<h2>No matching accounts</h2>',
      '<p>Try another issuer, email address, or account name.</p>',
      '<button id="clear-search-empty" class="secondary-button compact" type="button">Clear search</button>',
      '</div>'
    ].join('');
    const clearButton = document.getElementById('clear-search-empty');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchClearBtn.classList.add('hidden');
        this.applyFiltersAndSort();
        this.searchInput.focus();
      });
    }
    return;
  }

  this.accountList.innerHTML = [
    '<div class="empty-state">',
    '<div class="empty-symbol" aria-hidden="true">',
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M12 14v3"/></svg>',
    '</div>',
    '<p class="empty-eyebrow">' + (hasCloud ? 'Cloud vault linked' : 'Your vault is ready') + '</p>',
    '<h2>No accounts yet</h2>',
    '<p>' + (hasCloud ? 'Add a new account or restore accounts from your linked vault.' : 'Scan a QR code or enter the setup key from the service you are securing.') + '</p>',
    '<div class="empty-actions">',
    '<button id="add-first-btn" class="primary-button" type="button">Add first account</button>',
    hasCloud ? '<button id="restore-first-btn" class="text-button" type="button">Restore from cloud</button>' : '',
    '</div>',
    '</div>'
  ].join('');
};

AuthenticatorApp.prototype.render = function() {
  if (!this.accountList) return;
  this.accountList.classList.toggle('privacy-enabled', this.privacyMode);

  if (this.accountCounter) {
    const oldCount = Number.parseInt(this.accountCounter.textContent || '0', 10);
    this.accountCounter.textContent = String(this.accounts.length);
    this.accountCounter.setAttribute('aria-label', this.accounts.length + ' accounts');
    if (oldCount !== this.accounts.length) {
      this.accountCounter.classList.remove('bump');
      void this.accountCounter.offsetWidth;
      this.accountCounter.classList.add('bump');
    }
  }

  const eyeOpen = this.privacyBtn && this.privacyBtn.querySelector('.eye-open');
  const eyeClosed = this.privacyBtn && this.privacyBtn.querySelector('.eye-closed');
  if (eyeOpen && eyeClosed) {
    eyeOpen.classList.toggle('hidden', this.privacyMode);
    eyeClosed.classList.toggle('hidden', !this.privacyMode);
    this.privacyBtn.setAttribute('aria-pressed', String(this.privacyMode));
    this.privacyBtn.setAttribute('aria-label', this.privacyMode ? 'Show account details' : 'Hide account details');
    this.privacyBtn.title = this.privacyMode ? 'Show account details' : 'Hide account details';
  }

  document.querySelectorAll('.sort-chip[data-sort]').forEach((chip) => {
    const active = chip.dataset.sort === this.currentSort;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  if (this.filteredAccounts.length === 0) {
    this.renderEmptyState();
    return;
  }

  this.accountList.innerHTML = '';
  this.filteredAccounts.forEach((account, index) => {
    const element = document.createElement('article');
    element.dataset.id = String(account.id);
    element.style.setProperty('--item-delay', Math.min(index * 28, 180) + 'ms');

    if (String(this.editingAccountId) === String(account.id)) {
      this.renderEditingAccount(element, account, index);
    } else {
      this.renderAccountCard(element, account, index);
    }
    this.accountList.appendChild(element);
  });
  this.updateCodes();
};

AuthenticatorApp.prototype.renderEditingAccount = function(element, account, index) {
  element.className = 'account-item editing';
  element.innerHTML = [
    '<div class="account-card-main edit-layout">',
    '<span class="account-index static-index">' + String(index + 1).padStart(2, '0') + '</span>',
    '<span class="account-icon-wrapper">' + this.getIssuerIcon(account.issuer) + '</span>',
    '<div class="account-edit-fields">',
    '<label class="edit-field-group"><span>Issuer</span><input class="edit-field edit-issuer" type="text" maxlength="180" value="' + this.escapeHtml(account.issuer) + '"></label>',
    '<label class="edit-field-group"><span>Account</span><input class="edit-field edit-label" type="text" maxlength="180" value="' + this.escapeHtml(account.label) + '"></label>',
    '</div>',
    '</div>',
    '<div class="edit-actions">',
    '<button class="secondary-button compact edit-cancel" type="button">Cancel</button>',
    '<button class="primary-button compact edit-save" type="button">Save changes</button>',
    '</div>'
  ].join('');

  const issuerInput = element.querySelector('.edit-issuer');
  const iconWrapper = element.querySelector('.account-icon-wrapper');
  issuerInput.addEventListener('input', () => {
    iconWrapper.innerHTML = this.getIssuerIcon(issuerInput.value);
  });
  element.querySelectorAll('.edit-field').forEach((field) => {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.saveEdit(account.id);
      if (event.key === 'Escape') this.cancelEdit();
    });
  });
  element.querySelector('.edit-save').addEventListener('click', () => this.saveEdit(account.id));
  element.querySelector('.edit-cancel').addEventListener('click', () => this.cancelEdit());
};

AuthenticatorApp.prototype.renderAccountCard = function(element, account, index) {
  element.className = 'account-item';
  const privacyLabel = this.privacyMode ? 'hidden account' : (account.issuer || 'Unknown');
  const displayIssuer = this.privacyMode ? 'Hidden account' : (account.issuer || 'Unknown');
  const displayLabel = this.privacyMode ? 'Privacy mode is on' : (account.label || 'Account');
  const iconMarkup = this.getIssuerIcon(this.privacyMode ? '' : account.issuer);
  let descriptor;
  let spec = 'Invalid setup';
  let typeLabel = 'OTP';

  try {
    descriptor = this.getOtpDescriptor(account);
    const rawAlgorithm = String(descriptor.algorithm || 'SHA1').toUpperCase();
    const algorithm = rawAlgorithm.startsWith('SHA3-')
      ? rawAlgorithm
      : rawAlgorithm.replace(/^SHA(?=\d+$)/, 'SHA-');
    spec = descriptor.type === 'totp'
      ? algorithm + ' · ' + descriptor.digits + ' digits · ' + descriptor.period + ' sec'
      : algorithm + ' · ' + descriptor.digits + ' digits · counter ' + descriptor.counter;
    typeLabel = descriptor.type.toUpperCase();
  } catch (error) {
    descriptor = null;
  }

  const detailsId = 'account-details-' + index;
  const addedDate = this.formatDate(account.createdAt);
  const lastUsed = account.lastUsed ? this.formatDate(account.lastUsed) : 'Never';
  const profileMarkup = account.profile
    ? [
      '<div class="details-item details-wide">',
      '<span class="details-label">Cloud profiles</span>',
      '<span class="details-value details-profile">' + this.escapeHtml(this.privacyMode ? 'Hidden while privacy mode is on' : account.profile) + '</span>',
      '</div>'
    ].join('')
    : '';

  element.innerHTML = [
    '<div class="account-card-main">',
    '<button class="account-index account-copy-target" type="button" title="Copy code" aria-label="Copy code for ' + this.escapeHtml(privacyLabel) + '">' + String(index + 1).padStart(2, '0') + '</button>',
    '<span class="account-icon-wrapper">' + iconMarkup + '</span>',
    '<div class="account-info">',
    '<span class="account-issuer">' + this.escapeHtml(displayIssuer) + '</span>',
    '<span class="account-label">' + this.escapeHtml(displayLabel) + '</span>',
    '</div>',
    '<button class="account-otp-button account-copy-target" type="button" aria-label="Copy code for ' + this.escapeHtml(privacyLabel) + '">',
    '<span class="account-otp">--- ---</span>',
    '<span class="copy-hint">Copy</span>',
    '</button>',
    '<span class="account-time" aria-label="Code time remaining"><span class="account-seconds">30</span></span>',
    '</div>',
    '<div class="account-actions">',
    '<button class="card-action action-info" type="button" aria-expanded="false" aria-controls="' + detailsId + '">',
    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    '<span>Details</span>',
    '</button>',
    '<button class="card-action action-edit" type="button" title="' + (this.privacyMode ? 'Show account details to edit' : 'Edit account') + '" aria-label="Edit ' + this.escapeHtml(privacyLabel) + '"' + (this.privacyMode ? ' disabled' : '') + '>',
    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14 5 5 5M4 20l3.5-.8L19 7.7a2 2 0 0 0-2.8-2.8L4.8 16.3 4 20Z"/></svg>',
    '<span>Edit</span>',
    '</button>',
    '<button class="card-action action-delete" type="button" title="Delete account" aria-label="Delete ' + this.escapeHtml(privacyLabel) + '">',
    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M9 7V4h6v3M7 7l.8 13h8.4L17 7M10 11v5M14 11v5"/></svg>',
    '<span>Delete</span>',
    '</button>',
    '</div>',
    '<section id="' + detailsId + '" class="account-card-details hidden" aria-label="Account details">',
    '<div class="details-grid">',
    '<div class="details-item"><span class="details-label">Type</span><span class="details-value">' + typeLabel + '</span></div>',
    '<div class="details-item"><span class="details-label">Added</span><span class="details-value">' + addedDate + '</span></div>',
    '<div class="details-item"><span class="details-label">Last used</span><span class="details-value details-value-lastused">' + lastUsed + '</span></div>',
    '<div class="details-item"><span class="details-label">Copies</span><span class="details-value details-value-usecount">' + (account.useCount || 0) + '</span></div>',
    '<div class="details-item details-wide"><span class="details-label">Specification</span><span class="details-value spec-value">' + spec + '</span></div>',
    profileMarkup,
    '</div>',
    '</section>'
  ].join('');

  element.querySelectorAll('.account-copy-target').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.copyAccountCode(account, element);
    });
  });

  const detailsButton = element.querySelector('.action-info');
  const details = element.querySelector('.account-card-details');
  detailsButton.addEventListener('click', () => {
    const willOpen = details.classList.contains('hidden');
    document.querySelectorAll('.account-card-details').forEach((panel) => panel.classList.add('hidden'));
    document.querySelectorAll('.account-item').forEach((item) => item.classList.remove('details-expanded'));
    document.querySelectorAll('.action-info').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    details.classList.toggle('hidden', !willOpen);
    element.classList.toggle('details-expanded', willOpen);
    detailsButton.setAttribute('aria-expanded', String(willOpen));
  });
  element.querySelector('.action-edit').addEventListener('click', () => this.startEdit(account.id));
  element.querySelector('.action-delete').addEventListener('click', () => this.deleteAccount(account.id));

  if (!descriptor) element.classList.add('account-invalid');
};

AuthenticatorApp.prototype.copyAccountCode = async function(account, element) {
  try {
    const descriptor = this.getOtpDescriptor(account);
    const token = descriptor.type === 'hotp'
      ? descriptor.otp.generate({ counter: descriptor.counter })
      : descriptor.otp.generate();
    await this.copyText(token);

    const now = Date.now();
    account.lastUsed = now;
    account.useCount = (account.useCount || 0) + 1;
    account.updatedAt = now;

    if (descriptor.type === 'hotp') {
      const nextOtp = new OTPAuth.HOTP({
        issuer: descriptor.otp.issuer,
        label: descriptor.otp.label,
        secret: account.secret,
        algorithm: descriptor.algorithm,
        digits: descriptor.digits,
        counter: descriptor.counter + 1
      });
      account.uri = nextOtp.toString();
    }

    await this.saveAccounts(false);
    const useCount = element.querySelector('.details-value-usecount');
    const lastUsed = element.querySelector('.details-value-lastused');
    if (useCount) useCount.textContent = String(account.useCount);
    if (lastUsed) lastUsed.textContent = this.formatDate(account.lastUsed);
    element.classList.remove('copied-pulse');
    void element.offsetWidth;
    element.classList.add('copied-pulse');
    setTimeout(() => element.classList.remove('copied-pulse'), 420);
    this.updateCodes();
    this.showToast('Code copied', 'success');
  } catch (error) {
    this.showToast('Could not copy this code', 'error');
  }
};
