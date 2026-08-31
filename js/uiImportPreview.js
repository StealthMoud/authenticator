/* global AuthenticatorApp, VaultSync */

AuthenticatorApp.prototype.updateProfileSelectionCount = function() {
  const counter = document.getElementById('profile-selection-count');
  if (counter) counter.textContent = this.selectedProfileEmails.size + ' selected';
};

AuthenticatorApp.prototype.renderProfileSelection = function() {
  const container = document.getElementById('github-profiles-list');
  const section = document.getElementById('profile-selection-list');
  if (!container || !section) return;

  container.innerHTML = '';
  section.classList.remove('hidden');
  this.loadedProfiles.forEach((profile) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'profile-row';
    const active = this.selectedProfileEmails.has(profile.email);
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', String(active));
    row.innerHTML = [
      '<span class="profile-avatar" aria-hidden="true">' + this.escapeHtml((profile.email || '?').charAt(0).toUpperCase()) + '</span>',
      '<span class="profile-copy">',
      '<span class="profile-email">' + this.escapeHtml(profile.email || 'Unknown profile') + '</span>',
      '<span class="profile-count">' + (Array.isArray(profile.accounts) ? profile.accounts.length : 0) + ' accounts</span>',
      '</span>',
      '<span class="selection-check" aria-hidden="true">',
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4 10-10"/></svg>',
      '</span>'
    ].join('');

    row.addEventListener('click', () => {
      if (this.selectedProfileEmails.has(profile.email)) {
        this.selectedProfileEmails.delete(profile.email);
      } else {
        this.selectedProfileEmails.add(profile.email);
      }
      const selected = this.selectedProfileEmails.has(profile.email);
      row.classList.toggle('active', selected);
      row.setAttribute('aria-pressed', String(selected));
      this.updateProfileSelectionCount();
      this.updateCombinedAccounts();
    });
    container.appendChild(row);
  });
  this.updateProfileSelectionCount();
};

AuthenticatorApp.prototype.updateCombinedAccounts = function() {
  const combinedAccounts = [];
  const addedKeys = new Set();

  this.loadedProfiles.forEach((profile) => {
    if (!this.selectedProfileEmails.has(profile.email) || !Array.isArray(profile.accounts)) return;
    profile.accounts.forEach((account) => {
      const key = VaultSync.accountKey(account);
      if (!key || addedKeys.has(key)) return;
      addedKeys.add(key);
      combinedAccounts.push(account);
    });
  });

  this.currentCloudAccounts = combinedAccounts;
  this.selectedAccountSecrets = new Set(combinedAccounts.map((account) => VaultSync.accountKey(account)));
  const preview = document.getElementById('github-accounts-preview');
  if (preview) preview.classList.toggle('hidden', combinedAccounts.length === 0);
  if (combinedAccounts.length > 0) this.filterAndRenderCloudAccounts();
};

AuthenticatorApp.prototype.filterAndRenderCloudAccounts = function() {
  const term = this.cloudAccountsSearchInput
    ? this.cloudAccountsSearchInput.value.toLocaleLowerCase().trim()
    : '';
  const filtered = this.currentCloudAccounts.filter((account) => {
    return String(account.issuer || '').toLocaleLowerCase().includes(term)
      || String(account.label || '').toLocaleLowerCase().includes(term);
  });
  this.renderAccountPreview(filtered);
};

AuthenticatorApp.prototype.renderAccountPreview = function(accounts) {
  const container = document.getElementById('github-accounts-list');
  const title = document.getElementById('preview-title');
  if (!container) return;

  container.innerHTML = '';
  if (title) {
    title.textContent = 'Accounts · ' + this.selectedAccountSecrets.size + ' of ' + this.currentCloudAccounts.length + ' selected';
  }

  if (accounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cloud-list-empty';
    empty.textContent = 'No cloud accounts match this search.';
    container.appendChild(empty);
    return;
  }

  accounts.forEach((account) => {
    const key = VaultSync.accountKey(account);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cloud-account-item';
    const active = this.selectedAccountSecrets.has(key);
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', String(active));
    row.innerHTML = [
      '<span class="cloud-account-checkbox" aria-hidden="true">',
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m5 12 4 4 10-10"/></svg>',
      '</span>',
      '<span class="cloud-account-icon">' + this.getIssuerIcon(account.issuer) + '</span>',
      '<span class="cloud-account-details">',
      '<span class="cloud-account-name">' + this.escapeHtml(account.issuer || 'Unknown') + '</span>',
      '<span class="cloud-account-label">' + this.escapeHtml(account.label || 'Account') + '</span>',
      '</span>'
    ].join('');

    row.addEventListener('click', () => {
      if (this.selectedAccountSecrets.has(key)) {
        this.selectedAccountSecrets.delete(key);
      } else {
        this.selectedAccountSecrets.add(key);
      }
      const selected = this.selectedAccountSecrets.has(key);
      row.classList.toggle('active', selected);
      row.setAttribute('aria-pressed', String(selected));
      if (title) {
        title.textContent = 'Accounts · ' + this.selectedAccountSecrets.size + ' of ' + this.currentCloudAccounts.length + ' selected';
      }
    });
    container.appendChild(row);
  });
};
