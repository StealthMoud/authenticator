/* global AuthenticatorApp */

AuthenticatorApp.prototype.setupEventListeners = function() {
  this.searchInput.addEventListener('input', () => {
    this.searchClearBtn.classList.toggle('hidden', !this.searchInput.value);
    this.applyFiltersAndSort();
  });
  this.searchClearBtn.addEventListener('click', () => {
    this.searchInput.value = '';
    this.searchClearBtn.classList.add('hidden');
    this.searchInput.focus();
    this.applyFiltersAndSort();
  });

  this.cloudAccountsSearchInput.addEventListener('input', () => {
    this.cloudAccountsClearBtn.classList.toggle('hidden', !this.cloudAccountsSearchInput.value);
    this.filterAndRenderCloudAccounts();
  });
  this.cloudAccountsClearBtn.addEventListener('click', () => {
    this.cloudAccountsSearchInput.value = '';
    this.cloudAccountsClearBtn.classList.add('hidden');
    this.cloudAccountsSearchInput.focus();
    this.filterAndRenderCloudAccounts();
  });

  this.privacyBtn.addEventListener('click', () => this.togglePrivacyMode());
  this.exportVaultBtn.addEventListener('click', () => {
    if (this.accounts.length === 0) {
      this.showToast('There are no accounts to back up');
      return;
    }
    this.confirmAction(
      'Download readable backup?',
      'The JSON file contains your setup secrets without encryption. Store it somewhere private.',
      () => this.exportVault(),
      'Download backup'
    );
  });

  this.githubSyncBtn.addEventListener('click', () => {
    if (!this.ghToken || !this.ghRepo || !this.githubPermissionGranted) {
      this.isEditingConfig = Boolean(this.ghToken && this.ghRepo);
      this.openSettings();
      return;
    }
    this.syncToGithub(false);
  });
  this.statusBadge.addEventListener('click', () => {
    if (this.ghToken && this.ghRepo && this.githubPermissionGranted && !this.syncError) {
      this.syncToGithub(false);
    } else {
      this.openSettings();
    }
  });

  this.settingsSetupView.addEventListener('submit', (event) => this.saveGithubConfig(event));
  this.fetchGithubBtn.addEventListener('click', () => this.fetchFromGithub());
  this.importSelectedGhBtn.addEventListener('click', () => this.importFromSelectedProfile());
  this.importAllGhBtn.addEventListener('click', () => this.importAllFromCloud());
  this.fixSyncBtn.addEventListener('click', () => this.openSettings());
  this.settingsBtn.addEventListener('click', () => this.openSettings());
  this.settingsModal.querySelector('.close-settings').addEventListener('click', () => this.closeSettings());
  this.editVaultBtn.addEventListener('click', () => this.startEditingConfig());
  this.cancelGhEditBtn.addEventListener('click', () => this.cancelEditingConfig());
  this.disconnectBtn.addEventListener('click', () => {
    this.confirmAction(
      'Disconnect cloud vault?',
      'The GitHub token and repository link will be removed from this browser. Local accounts stay here.',
      () => this.disconnectVault(),
      'Disconnect'
    );
  });
  this.clearAllBtn.addEventListener('click', () => {
    if (this.accounts.length === 0) {
      this.showToast('The local vault is already empty');
      return;
    }
    this.confirmAction(
      'Delete the local vault?',
      'Every account will be removed from this browser. If cloud sync is linked, the removal is applied to this profile.',
      () => this.clearAllAccounts(),
      'Delete vault'
    );
  });

  this.openSettingsFromImport.addEventListener('click', () => {
    this.closeImportModal();
    this.openSettings();
  });

  this.sortOrderBtn.addEventListener('click', async () => {
    this.sortAscending = !this.sortAscending;
    await this.storageSet({ sortAscending: this.sortAscending });
    this.updateOrderIcon();
    this.applyFiltersAndSort();
  });
  document.querySelectorAll('.sort-chip[data-sort]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      this.currentSort = chip.dataset.sort;
      await this.storageSet({ currentSort: this.currentSort });
      this.updateOrderIcon();
      this.applyFiltersAndSort();
    });
  });

  this.importBtn.addEventListener('click', () => this.openImportModal('all'));
  this.importModal.querySelector('.close-modal').addEventListener('click', () => this.closeImportModal());
  this.importViewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => this.setImportView(tab.dataset.importView));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = this.importViewTabs[(index + offset + this.importViewTabs.length) % this.importViewTabs.length];
      this.setImportView(next.dataset.importView);
      next.focus();
    });
  });

  this.accountList.addEventListener('click', (event) => {
    if (event.target.closest('#add-first-btn')) this.openImportModal('all');
    if (event.target.closest('#restore-first-btn')) {
      this.openImportModal('restore').then(() => this.fetchFromGithub());
    }
  });

  const bindDropZone = (zone, input, onFile) => {
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) onFile(file);
    });
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('dragover');
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (file) onFile(file);
    });
  };
  bindDropZone(this.dropZone, this.fileInput, (file) => this.processFile(file));
  bindDropZone(this.backupDropZone, this.backupFileInput, (file) => this.restoreBackupFile(file));
  this.manualForm.addEventListener('submit', (event) => this.handleManualAccount(event));

  this.qrTabCamera.addEventListener('click', () => this.switchQRMode('camera'));
  this.qrTabFile.addEventListener('click', () => this.switchQRMode('file'));
  this.cameraSwitchToFile.addEventListener('click', () => this.switchQRMode('file'));
  this.cameraSelect.addEventListener('change', (event) => {
    if (event.target.value) this.startCamera(event.target.value);
  });
  this.requestCameraPermissionBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  });

  window.addEventListener('click', (event) => {
    if (event.target === this.importModal) this.closeImportModal();
    if (event.target === this.settingsModal) this.closeSettings();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        event.preventDefault();
        this.searchInput.focus();
      }
    }

    if (event.key === 'Escape') {
      if (!this.confirmOverlay.classList.contains('hidden')) {
        this.confirmCancelBtn.click();
      } else if (!this.importModal.classList.contains('hidden')) {
        this.closeImportModal();
      } else if (!this.settingsModal.classList.contains('hidden')) {
        this.closeSettings();
      } else if (this.editingAccountId) {
        this.cancelEdit();
      } else if (this.searchInput.value) {
        this.searchClearBtn.click();
      }
    }

    if (event.key === 'Tab') this.keepFocusInsideTopDialog(event);
  });

  window.addEventListener('beforeunload', () => {
    this.stopCamera();
    if (this.timerInterval) clearInterval(this.timerInterval);
  });
  window.addEventListener('focus', async () => {
    if (this.currentQRMode === 'camera'
      && this.currentImportView === 'scan'
      && !this.cameraStream
      && !this.importModal.classList.contains('hidden')) {
      await this.checkCameraAvailability();
      if (this.cameraPermissionState === 'granted') this.startCamera();
    }
  });
};

AuthenticatorApp.prototype.keepFocusInsideTopDialog = function(event) {
  const openDialogs = [this.importModal, this.settingsModal, this.confirmOverlay]
    .filter((modal) => modal && !modal.classList.contains('hidden'));
  const modal = openDialogs[openDialogs.length - 1];
  if (!modal) return;

  const focusable = Array.from(modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
