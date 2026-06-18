/* global AuthenticatorApp */

AuthenticatorApp.prototype.deleteAccount = function(id) {
  this.confirmAction('Delete Account', 'Remove this account? This cannot be undone.', () => {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.applyFiltersAndSort();
    this.saveAccounts();
    this.syncToGithub();
    this.showToast('Account removed');
  });
};

AuthenticatorApp.prototype.startEdit = function(id) {
  this.editingAccountId = id;
  this.render();

  // focus the first edit field after render
  const card = this.accountList.querySelector(`[data-id="${id}"]`);
  if (card) {
    const firstInput = card.querySelector('.edit-field');
    if (firstInput) firstInput.focus();
  }
};

AuthenticatorApp.prototype.saveEdit = function(id) {
  const card = this.accountList.querySelector(`[data-id="${id}"]`);
  if (!card) return;

  const issuerInput = card.querySelector('.edit-issuer');
  const labelInput = card.querySelector('.edit-label');
  const acc = this.accounts.find(a => a.id == id);
  if (!acc) return;

  const newIssuer = issuerInput?.value.trim();
  const newLabel = labelInput?.value.trim();

  if (newIssuer) acc.issuer = newIssuer;
  if (newLabel) acc.label = newLabel;

  this.editingAccountId = null;
  this.applyFiltersAndSort();
  this.saveAccounts();
  this.syncToGithub();
  this.showToast('Account updated');
};

AuthenticatorApp.prototype.cancelEdit = function() {
  this.editingAccountId = null;
  this.render();
};

AuthenticatorApp.prototype.clearAllAccounts = function() {
  this.accounts = [];
  this.saveAccounts();
  this.render();
  this.syncToGithub();
  this.closeSettings();
  this.showToast('Vault cleared');
};

AuthenticatorApp.prototype.exportVault = function() {
  const backupData = JSON.stringify(this.accounts, null, 2);
  const blob = new Blob([backupData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auth_vault_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  this.showToast('Backup file downloaded');
};
