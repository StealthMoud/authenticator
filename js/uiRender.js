/* global AuthenticatorApp, OTPAuth */

AuthenticatorApp.prototype.render = function() {
  if (!this.accountList) return;
  this.accountList.classList.toggle('privacy-enabled', this.privacyMode);

  // toggle privacy icon
  const eyeOpen = this.privacyBtn?.querySelector('.eye-open');
  const eyeClosed = this.privacyBtn?.querySelector('.eye-closed');
  if (eyeOpen && eyeClosed) {
    eyeOpen.classList.toggle('hidden', this.privacyMode);
    eyeClosed.classList.toggle('hidden', !this.privacyMode);
  }

  if (this.filteredAccounts.length === 0) {
    if (this.accounts.length === 0) {
      const isCloudConnected = !!(this.ghToken && this.ghRepo);
      if (isCloudConnected) {
        this.accountList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon" style="color: var(--accent); opacity: 0.8;">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
            </div>
            <p class="empty-title">Cloud Vault Linked</p>
            <p class="empty-subtitle">No accounts on this device yet. Start fresh or restore your cloud data.</p>
            <div class="empty-actions">
              <button id="add-first-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                Add Account
              </button>
              <button id="restore-first-btn" class="btn-action-outline">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Restore Cloud Data
              </button>
            </div>
          </div>`;
      } else {
        this.accountList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
            </div>
            <p class="empty-title">No accounts yet</p>
            <button id="add-first-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              Add Your First Account
            </button>
          </div>`;
      }
    } else {
      this.accountList.innerHTML = '<div class="empty-state"><p>No matching accounts</p></div>';
    }
    return;
  }

  this.accountList.innerHTML = '';
  this.filteredAccounts.forEach((acc, i) => {
    const el = document.createElement('div');
    el.dataset.id = acc.id;
    el.style.animationDelay = `${i * 0.05}s`;

    if (this.editingAccountId === acc.id) {
      // inline edit mode
      el.className = 'account-item editing';
      el.innerHTML = `
        <div class="account-icon-wrapper">
          ${this.getIssuerIcon(acc.issuer)}
        </div>
        <div class="account-info">
          <div class="edit-input-group">
            <span class="edit-input-label">Label</span>
            <input type="text" class="edit-field edit-label" value="${this.escapeHtml(acc.label)}" placeholder="Label">
          </div>
          <div class="edit-input-group">
            <span class="edit-input-label">Issuer</span>
            <input type="text" class="edit-field edit-issuer" value="${this.escapeHtml(acc.issuer)}" placeholder="Issuer">
          </div>
          <div class="edit-actions">
            <button class="edit-save">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Save
            </button>
            <button class="edit-cancel">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              Cancel
            </button>
          </div>
        </div>`;

      // live icon updates on issuer input
      const issuerInput = el.querySelector('.edit-issuer');
      const iconWrapper = el.querySelector('.account-icon-wrapper');
      if (issuerInput && iconWrapper) {
        issuerInput.addEventListener('input', () => {
          iconWrapper.innerHTML = this.getIssuerIcon(issuerInput.value);
        });
      }

      // key handler for Enter/Escape
      el.querySelectorAll('.edit-field').forEach(field => {
        field.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.saveEdit(acc.id);
          if (e.key === 'Escape') this.cancelEdit();
        });
      });
      el.querySelector('.edit-save').addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveEdit(acc.id);
      });
      el.querySelector('.edit-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelEdit();
      });
    } else {
      // normal display mode
      const profileCount = acc.profile ? acc.profile.split(', ').length : 0;
      const activeIdx = (acc.selectedProfileIndex !== undefined && acc.selectedProfileIndex < profileCount) ? acc.selectedProfileIndex : 0;
      const currentEmail = profileCount > 0 ? acc.profile.split(', ')[activeIdx] : '';

      el.className = 'account-item';
      el.innerHTML = `
        <div class="account-icon-wrapper">
          ${this.getIssuerIcon(acc.issuer)}
        </div>
        <div class="account-info">
          <span class="account-label">${this.escapeHtml(acc.label)}</span>
          <span class="account-issuer">${this.escapeHtml(acc.issuer)}</span>
          ${acc.profile ? `
            <div class="account-profile-badges" data-profiles="${this.escapeHtml(acc.profile)}" data-index="${activeIdx}">
              <span class="account-profile-badge" title="Imported from: ${this.escapeHtml(currentEmail)}">${this.escapeHtml(currentEmail)}</span>
              ${profileCount > 1 ? `
                <button class="badge-cycle-btn" title="Cycle through profiles">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
        <div class="account-otp">--- ---</div>
        <div class="account-actions">
          <button class="action-copy" title="Copy code">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="action-edit" title="Edit account">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          <button class="action-delete" title="Delete account">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>`;

      // click on card body -> copy
      el.addEventListener('click', (e) => {
        // dont copy if they clicked an action button or the cycle button
        if (e.target.closest('.account-actions') || e.target.closest('.badge-cycle-btn')) return;
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        navigator.clipboard.writeText(totp.generate());
        this.showToast('Copied to clipboard');
        acc.lastUsed = Date.now();
        this.saveAccounts();

        el.classList.remove('copied-pulse');
        void el.offsetWidth; // trigger reflow to restart keyframe animation
        el.classList.add('copied-pulse');
        setTimeout(() => el.classList.remove('copied-pulse'), 400);
      });

      // action: explicit copy
      el.querySelector('.action-copy').addEventListener('click', (e) => {
        e.stopPropagation();
        const totp = new OTPAuth.TOTP({ secret: acc.secret });
        navigator.clipboard.writeText(totp.generate());
        this.showToast('Copied to clipboard');
        acc.lastUsed = Date.now();
        this.saveAccounts();

        el.classList.remove('copied-pulse');
        void el.offsetWidth; // trigger reflow to restart keyframe animation
        el.classList.add('copied-pulse');
        setTimeout(() => el.classList.remove('copied-pulse'), 400);
      });

      // action: edit
      el.querySelector('.action-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        this.startEdit(acc.id);
      });

      // action: delete
      el.querySelector('.action-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteAccount(acc.id);
      });

      // action: cycle profile
      const cycleBtn = el.querySelector('.badge-cycle-btn');
      if (cycleBtn) {
        cycleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const container = cycleBtn.closest('.account-profile-badges');
          if (container) {
            const profiles = container.dataset.profiles.split(', ');
            let idx = parseInt(container.dataset.index || '0', 10);
            idx = (idx + 1) % profiles.length;
            container.dataset.index = idx;
            acc.selectedProfileIndex = idx;
            this.saveAccounts();
            const badge = container.querySelector('.account-profile-badge');
            if (badge) {
              badge.textContent = profiles[idx];
              badge.title = `Imported from: ${profiles[idx]}`;
            }
          }
        });
      }
    }

    this.accountList.appendChild(el);
  });
};
