/* global AuthenticatorApp */

AuthenticatorApp.prototype.setupEventListeners = function() {
  if (this.searchInput) {
    this.searchInput.addEventListener('input', () => {
      if (this.searchClearBtn) {
        this.searchClearBtn.classList.toggle('hidden', !this.searchInput.value);
      }
      this.applyFiltersAndSort();
    });
  }
  if (this.searchClearBtn) {
    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchClearBtn.classList.add('hidden');
      this.searchInput.focus();
      this.applyFiltersAndSort();
    });
  }
  if (this.cloudAccountsSearchInput) {
    this.cloudAccountsSearchInput.addEventListener('input', () => {
      if (this.cloudAccountsClearBtn) {
        this.cloudAccountsClearBtn.classList.toggle('hidden', !this.cloudAccountsSearchInput.value);
      }
      this.filterAndRenderCloudAccounts();
    });
  }
  if (this.cloudAccountsClearBtn) {
    this.cloudAccountsClearBtn.addEventListener('click', () => {
      this.cloudAccountsSearchInput.value = '';
      this.cloudAccountsClearBtn.classList.add('hidden');
      this.cloudAccountsSearchInput.focus();
      this.filterAndRenderCloudAccounts();
    });
  }
  if (this.privacyBtn) this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());

  if (this.exportVaultBtn) {
    this.exportVaultBtn.addEventListener('click', () => {
      if (this.accounts.length === 0) { this.showToast('Nothing to export'); return; }
      this.confirmAction('Export Backup', 'Download a local backup of your 2FA codes?', () => this.exportVault());
    });
  }

  if (this.githubSyncBtn) {
    this.githubSyncBtn.addEventListener('click', () => {
      if (!this.ghToken || !this.ghRepo) {
        this.openSettings();
      } else {
        this.syncToGithub();
      }
    });
  }
  if (this.saveGhConfigBtn) this.saveGhConfigBtn.addEventListener('click', () => this.saveGithubConfig());
  if (this.fetchGithubBtn) this.fetchGithubBtn.addEventListener('click', () => this.fetchFromGithub());
  if (this.importSelectedGhBtn) this.importSelectedGhBtn.addEventListener('click', () => this.importFromSelectedProfile());
  if (this.importAllGhBtn) this.importAllGhBtn.addEventListener('click', () => this.importAllFromCloud());

  // fix-sync opens settings, not import
  if (this.fixSyncBtn) {
    this.fixSyncBtn.addEventListener('click', () => this.openSettings());
  }

  // status badge opens settings
  if (this.statusBadge) {
    this.statusBadge.addEventListener('click', () => this.openSettings());
  }

  // settings panel
  if (this.settingsBtn) this.settingsBtn.addEventListener('click', () => this.openSettings());
  const closeSettings = this.settingsModal?.querySelector('.close-settings');
  if (closeSettings) closeSettings.addEventListener('click', () => this.closeSettings());
  window.addEventListener('click', (e) => {
    if (e.target === this.settingsModal) this.closeSettings();
  });

  if (this.editVaultBtn) this.editVaultBtn.addEventListener('click', () => this.startEditingConfig());
  if (this.cancelGhEditBtn) this.cancelGhEditBtn.addEventListener('click', () => this.cancelEditingConfig());

  // disconnect vault
  if (this.disconnectBtn) {
    this.disconnectBtn.addEventListener('click', () => {
      this.confirmAction('Disconnect Vault', 'Remove cloud sync configuration? Your cloud data will stay intact.', () => this.disconnectVault());
    });
  }

  // link from import modal -> settings
  if (this.openSettingsFromImport) {
    this.openSettingsFromImport.addEventListener('click', () => {
      this.importModal.classList.add('hidden');
      this.openSettings();
    });
  }

  // sort order toggle
  if (this.sortOrderBtn) {
    this.sortOrderBtn.addEventListener('click', () => {
      this.sortAscending = !this.sortAscending;
      chrome.storage.local.set({ sortAscending: this.sortAscending });
      this.updateOrderIcon();
      this.applyFiltersAndSort();
    });
  }

  // sort chips
  document.querySelectorAll('.sort-chip').forEach(chip => {
    if (chip.dataset.sort) {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentSort = e.currentTarget.dataset.sort;
        this.applyFiltersAndSort();
      });
    }
  });

  // clear all accounts (now in settings panel)
  if (this.clearAllBtn) {
    this.clearAllBtn.addEventListener('click', () => {
      if (this.accounts.length === 0) {
        this.showToast('No data to clear'); return;
      }
      this.confirmAction('Reset Vault', 'Delete all accounts from this device? This cannot be undone.', () => this.clearAllAccounts());
    });
  }

  // import modal trigger & close
  if (this.importBtn) this.importBtn.addEventListener('click', () => this.openImportModal('all'));

  const closeImportBtn = this.importModal?.querySelector('.close-modal');
  if (closeImportBtn) closeImportBtn.addEventListener('click', () => this.closeImportModal());
  window.addEventListener('click', (e) => { if (e.target === this.importModal) this.closeImportModal(); });

  // empty state button delegation
  if (this.accountList) {
     this.accountList.addEventListener('click', (e) => {
       if (e.target) {
         if (e.target.closest('#add-first-btn')) {
           this.openImportModal('add');
         } else if (e.target.closest('#restore-first-btn')) {
           this.openImportModal('restore');
           this.fetchFromGithub();
         } else {
           const cycleBtn = e.target.closest('.badge-cycle-btn');
           if (cycleBtn) {
             e.stopPropagation();
             const container = cycleBtn.closest('.account-profile-badges');
             if (container) {
               const profiles = container.dataset.profiles.split(', ');
               let idx = parseInt(container.dataset.index || '0', 10);
               idx = (idx + 1) % profiles.length;
               container.dataset.index = idx;
               const badge = container.querySelector('.account-profile-badge');
               if (badge) {
                 badge.textContent = profiles[idx];
                 badge.title = `Imported from: ${profiles[idx]}`;
               }
             }
           }
         }
       }
     });
   }

  // file drop zone
  if (this.dropZone) {
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropZone.classList.add('dragover'); });
    this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.processFile(file);
    });
  }
};
