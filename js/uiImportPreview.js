/* global AuthenticatorApp */

AuthenticatorApp.prototype.renderProfileSelection = function() {
  const container = document.getElementById('github-profiles-list');
  if (!container) return;
  container.innerHTML = '';
  document.getElementById('profile-selection-list').classList.remove('hidden');
  this.loadedProfiles.forEach((profile) => {
    const row = document.createElement('div');
    row.className = 'sort-chip';
    row.style.width = '100%'; row.style.borderRadius = '8px';
    row.style.display = 'flex'; row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px'; row.style.marginBottom = '4px';

    if (this.selectedProfileEmails.has(profile.email)) {
      row.classList.add('active');
    }

    row.innerHTML = `<span style="font-size: 0.75rem">${profile.email}</span><span style="font-size: 0.6rem; opacity: 0.6">${profile.accounts.length} items</span>`;
    
    row.onclick = () => {
      if (this.selectedProfileEmails.has(profile.email)) {
        this.selectedProfileEmails.delete(profile.email);
        row.classList.remove('active');
      } else {
        this.selectedProfileEmails.add(profile.email);
        row.classList.add('active');
      }
      this.updateCombinedAccounts();
    };
    container.appendChild(row);
  });
};

AuthenticatorApp.prototype.updateCombinedAccounts = function() {
  const combinedAccounts = [];
  const addedSecrets = new Set();
  
  this.loadedProfiles.forEach(profile => {
    if (this.selectedProfileEmails.has(profile.email)) {
      profile.accounts.forEach(acc => {
        if (acc && acc.secret && !addedSecrets.has(acc.secret)) {
          addedSecrets.add(acc.secret);
          combinedAccounts.push(acc);
        }
      });
    }
  });

  this.currentCloudAccounts = combinedAccounts;

  // By default, select all combined accounts
  this.selectedAccountSecrets.clear();
  combinedAccounts.forEach(acc => this.selectedAccountSecrets.add(acc.secret));

  const previewContainer = document.getElementById('github-accounts-preview');
  if (combinedAccounts.length === 0) {
    if (previewContainer) previewContainer.classList.add('hidden');
  } else {
    if (previewContainer) previewContainer.classList.remove('hidden');
    this.filterAndRenderCloudAccounts();
  }
};

AuthenticatorApp.prototype.filterAndRenderCloudAccounts = function() {
  const term = this.cloudAccountsSearchInput ? this.cloudAccountsSearchInput.value.toLowerCase().trim() : '';
  const filtered = this.currentCloudAccounts.filter(acc => {
    const issuer = (acc.issuer || '').toLowerCase();
    const label = (acc.label || '').toLowerCase();
    return issuer.includes(term) || label.includes(term);
  });
  this.renderAccountPreview(filtered);
};

AuthenticatorApp.prototype.renderAccountPreview = function(accounts) {
  const container = document.getElementById('github-accounts-list');
  if (!container) return;
  container.innerHTML = '';
  
  // Update heading to show selection count
  const previewTitle = document.getElementById('preview-title');
  if (previewTitle) {
    previewTitle.textContent = `Select accounts to import (${this.selectedAccountSecrets.size} of ${this.currentCloudAccounts.length}):`;
  }

  if (accounts.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '20px';
    emptyDiv.style.color = 'var(--text-dim)';
    emptyDiv.style.fontSize = '0.75rem';
    emptyDiv.innerText = 'No matching cloud accounts';
    container.appendChild(emptyDiv);
    return;
  }

  accounts.forEach(acc => {
    const itemEl = document.createElement('div');
    itemEl.className = 'cloud-account-item';
    
    const isActive = this.selectedAccountSecrets.has(acc.secret);
    if (isActive) {
      itemEl.classList.add('active');
    }

    itemEl.innerHTML = `
      <div class="cloud-account-checkbox">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      ${this.getIssuerIcon(acc.issuer)}
      <div class="cloud-account-details">
        <span class="cloud-account-name">${this.escapeHtml(acc.issuer || 'Unknown')}</span>
        <span class="cloud-account-label">${this.escapeHtml(acc.label || '')}</span>
      </div>
    `;

    itemEl.onclick = () => {
      if (this.selectedAccountSecrets.has(acc.secret)) {
        this.selectedAccountSecrets.delete(acc.secret);
        itemEl.classList.remove('active');
      } else {
        this.selectedAccountSecrets.add(acc.secret);
        itemEl.classList.add('active');
      }
      if (previewTitle) {
        previewTitle.textContent = `Select accounts to import (${this.selectedAccountSecrets.size} of ${this.currentCloudAccounts.length}):`;
      }
    };
    
    container.appendChild(itemEl);
  });
};
