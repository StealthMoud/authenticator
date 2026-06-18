# Authenticator

A premium, secure, and beautiful Chrome extension for managing two-factor authentication (2FA) codes. Built with a focus on absolute privacy, fluid glassmorphism aesthetics, and clean user experience.

## Key Features

- **Elite UI/UX**: State-of-the-art glassmorphism design with mesh gradients, backdrop blurs, and reactive hover animations.
- **Connection Status Badge**: Color-coded status badge in the header shows real-time sync states. Click the badge to open the Settings panel instantly.
- **Dedicated Settings**: Accessed via the gear icon. Setup and configure your GitHub cloud sync, disconnect your vault, or perform a complete local reset from the Danger Zone.
- **Autonomous Cloud Sync**: Real-time synchronization to a private GitHub repository. No external servers or third parties ever see your secrets.
- **Multi-Profile Vaults**: Automatic detection of Chrome profile identities. Supports syncing separate vaults for different profiles (e.g., work, personal) under a single GitHub repository.
- **Inline Editing & Management**: Actions appear on hover. Copy TOTP codes, edit issuer/label fields inline, or delete accounts with full safety confirmations.
- **Privacy Mode**: Instantly mask sensitive labels, issuer names, and OTP codes for secure usage in public spaces.
- **Dynamic Sorting & Filtering**:
  - **Smart Name Sort**: Alphabetical grouping by issuer and account label.
  - **A-Z / Z-A Toggle**: Flip sorting direction instantly.
  - **Usage-Based**: Automatically tracks and prioritizes your most frequently accessed codes.
- **Flexible Data Mobility**:
  - **Cloud Fetch**: Scan your GitHub vault and merge profile datasets with one click.
  - **Local Backup**: Export or import your entire vault to/from a local JSON file.

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extension folder.

## Cloud Sync Setup

1. Create a **Private** repository on GitHub (e.g., `authenticator-vault`).
2. Generate a **Personal Access Token (classic)** with the `repo` scope.
3. Open the extension, click the gear icon to open **Settings**, and enter your GitHub token, repository path (`username/repo`), and optional target file path.
4. Click **Link Cloud Vault** to connect. Your vault will automatically sync in the background.

## Usage

- **Add Account**: Click the `+` button in the header to import a QR code image or paste a raw secret key.
- **Copy TOTP Code**: Click an account card or hover over it and click the copy icon.
- **Edit/Delete**: Hover over any card to reveal edit (pencil) and delete (trash) controls.
- **Toggle Privacy Mode**: Click the eye icon in the header to hide or reveal codes and issuer names.
- **Sync/Backup/Restore**: Click **Cloud Sync** or **Export Backup** in the footer to import local files, backup data, or restore from the cloud vault.

## Security & Privacy

Privacy is the core pillar of this project.

- **Local First**: All secrets are stored securely within your browser's local sandbox using `chrome.storage.local`.
- **Zero Third-Party Servers**: Synchronization communicates directly with the GitHub API from your browser.
- **Isolated Vault Files**: Separate browser profiles write to separate files in your repository, preventing cross-profile data leakage.
