# Authenticator

A local-first Chrome extension for TOTP and HOTP codes, with optional synchronization to a private GitHub repository.

## What it does

- Generates TOTP and HOTP codes using each account's configured algorithm, digit count, period, or counter.
- Adds accounts from a QR image, the camera, a Base32 setup key, a local backup, or a linked cloud vault.
- Searches and sorts by vault order, name, date added, or usage.
- Tracks copy count and last-used time locally.
- Hides issuer, account label, and code together with privacy mode.
- Exports and restores a versioned JSON backup.
- Optionally merges multiple browser profiles through one GitHub vault without treating a fresh install as a deletion.

## Security model

The extension has no application server. OTP generation and QR decoding happen inside the extension, and account data is kept in `chrome.storage.local` unless GitHub sync is enabled.

Important boundaries:

- Chrome local storage is not an encrypted password manager. Anyone who can access the browser profile or extension data may be able to recover the setup keys.
- Local backup files contain readable OTP setup keys. Store them as carefully as passwords.
- GitHub sync writes readable JSON to `profiles/common.json`. Use a **private** repository and a narrowly scoped fine-grained token.
- The token is stored in the extension's local Chrome storage and is never rendered back into the settings form.
- Camera access is requested from a dedicated page after an explicit click. Captured video is processed on-device and is not uploaded.
- GitHub access is an optional host permission; the service worker is the only extension component that calls the GitHub API.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this directory.
5. Pin **Authenticator** from Chrome's extensions menu if desired.

## Add or restore accounts

Open the popup and select **Add**:

- **Scan** accepts a QR image or uses the camera.
- **Enter key** creates a TOTP account from an issuer, label, Base32 secret, algorithm, digits, and period.
- **Restore** imports an Authenticator JSON backup or selected accounts from a linked GitHub vault.

Google Authenticator migration QR payloads are supported. Malformed or unsupported accounts are rejected rather than stored.

## Optional GitHub vault

1. Create a private GitHub repository.
2. Create a fine-grained personal access token limited to that repository, with **Contents: Read and write**.
3. Open **Settings** in Authenticator.
4. Enter the token and repository as `owner/repository`.
5. Select **Link and sync** and approve access to `api.github.com`.

The sync engine sanitizes remote data, retries write conflicts, records explicit deletion tombstones, preserves other profiles, and skips the GitHub write when nothing changed. Disconnecting removes the saved token and optional GitHub host permission from this browser profile; it does not delete the repository.

## Backups

Select **Backup** in the action dock and confirm the plaintext warning. The downloaded document uses schema version 2 and can be restored from **Add → Restore**. Legacy account-array JSON files are also accepted.

## Development

The extension is dependency-free at runtime. The test suite uses Node's built-in test runner.

```sh
npm run check
```

Key modules:

- `background.js` — trusted service-worker messaging, GitHub reads/writes, timeouts, and conflict retries.
- `lib/vaultSync.js` — pure account validation, merge, deletion, and profile logic.
- `js/actionImport.js` — QR, migration, manual-entry, and backup import flows.
- `js/uiRender.js` — account cards, editing, privacy, and OTP presentation.
- `tests/vaultSync.test.js` — deterministic sync and validation coverage.

## Permissions

- `storage` stores vault data and preferences in the current Chrome profile.
- `identity` and `identity.email` identify a Chrome profile for multi-profile vault membership; a random local identifier is used when email is unavailable.
- `https://api.github.com/*` is optional and requested only when GitHub sync is configured.

The Manifest V3 content security policy permits only packaged scripts and styles, local/data/blob media, and GitHub API connections.
