/* global AuthenticatorApp, OTPAuth, VaultSync */

AuthenticatorApp.prototype.deleteAccount = function(id) {
  const account = this.accounts.find((entry) => String(entry.id) === String(id));
  if (!account) return;

  this.confirmAction(
    'Delete account?',
    'Remove ' + (this.privacyMode ? 'this hidden account' : (account.issuer || 'this account'))
      + (this.ghToken && this.ghRepo
        ? ' from this device and its profile in the linked cloud vault.'
        : ' from this device.'),
    async () => {
      this.accounts = this.accounts.filter((entry) => String(entry.id) !== String(id));
      this.deletedAccountKeys = VaultSync.normalizeDeletions([
        ...this.deletedAccountKeys,
        { key: VaultSync.accountKey(account), deletedAt: Date.now() }
      ]);
      this.applyFiltersAndSort();
      await this.syncAfterLocalChange();
      this.showToast('Account removed', 'success');
    },
    'Delete account'
  );
};

AuthenticatorApp.prototype.startEdit = function(id) {
  if (this.privacyMode) {
    this.showToast('Show account details before editing');
    return;
  }
  this.editingAccountId = String(id);
  this.render();
  const card = Array.from(this.accountList.querySelectorAll('.account-item'))
    .find((element) => element.dataset.id === String(id));
  const firstInput = card && card.querySelector('.edit-field');
  if (firstInput) firstInput.focus();
};

AuthenticatorApp.prototype.saveEdit = async function(id) {
  const card = Array.from(this.accountList.querySelectorAll('.account-item'))
    .find((element) => element.dataset.id === String(id));
  const account = this.accounts.find((entry) => String(entry.id) === String(id));
  if (!card || !account) return;

  const issuer = card.querySelector('.edit-issuer').value.trim();
  const label = card.querySelector('.edit-label').value.trim();
  if (!issuer || !label) {
    this.showToast('Issuer and account name are required', 'error');
    return;
  }

  account.issuer = issuer.slice(0, 180);
  account.label = label.slice(0, 180);
  try {
    const descriptor = this.getOtpDescriptor(account);
    const sharedOptions = {
      issuer: account.issuer,
      label: account.label,
      secret: account.secret,
      algorithm: descriptor.algorithm,
      digits: descriptor.digits
    };
    account.uri = descriptor.type === 'hotp'
      ? new OTPAuth.HOTP({ ...sharedOptions, counter: descriptor.counter }).toString()
      : new OTPAuth.TOTP({ ...sharedOptions, period: descriptor.period }).toString();
  } catch (error) {
    account.uri = '';
  }
  account.updatedAt = Date.now();
  this.editingAccountId = null;
  this.applyFiltersAndSort();
  await this.syncAfterLocalChange();
  this.showToast('Account updated', 'success');
};

AuthenticatorApp.prototype.cancelEdit = function() {
  this.editingAccountId = null;
  this.render();
};

AuthenticatorApp.prototype.clearAllAccounts = async function() {
  const tombstones = this.accounts.map((account) => ({
    key: VaultSync.accountKey(account),
    deletedAt: Date.now()
  }));
  this.deletedAccountKeys = VaultSync.normalizeDeletions([
    ...this.deletedAccountKeys,
    ...tombstones
  ]);
  this.accounts = [];
  this.applyFiltersAndSort();
  this.closeSettings();
  await this.syncAfterLocalChange();
  this.showToast('Local vault deleted', 'success');
};

AuthenticatorApp.prototype.exportVault = function() {
  const payload = {
    schemaVersion: VaultSync.SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: this.accounts.map((account) => {
      const { profile, ...portableAccount } = account;
      return portableAccount;
    })
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'authenticator-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  this.showToast('Backup downloaded', 'success');
};
