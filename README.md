# Authenticator

A premium, secure, and beautiful Chrome extension for managing your two-factor authentication (2FA) codes. Built with a focus on privacy and elite-tier user experience.

## ✨ Key Features

- **Elite UI/UX**: State-of-the-art glassmorphism design with mesh gradients, backdrop blurs, and reactive hover animations.
- **Autonomous Cloud Sync**: Real-time synchronization to a private GitHub repository. Never lose your 2FA seeds again.
- **Multi-Profile Mastery**: Automatic detection of Chrome profile identities. Sync separate vaults for work, personal, and secondary accounts under one GitHub repo.
- **Privacy Mode**: One-click masking of sensitive labels and OTP codes for secure usage in public spaces.
- **Dynamic Sorting & Filtering**:
  - **Smart Name Sort**: Intelligent alphabetical grouping by issuer and account label.
  - **A-Z/Z-A Toggle**: Flip sorting direction instantly with a dedicated order toggle.
  - **Usage Based**: Automatically prioritizes your most frequently accessed codes.
- **Intelligent Recovery**:
  - **Cloud Fetch**: Scan your entire GitHub vault and selectively import accounts from any profile found.
  - **Bulk Merge**: One-click restoration of all cloud-synced accounts into your current profile.
- **Local Resilience**: Export your entire vault to a local JSON file for offline backups.

## 🚀 Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extension folder.

## ☁️ Cloud Sync Setup

1. Create a **Private** repository on GitHub (e.g., `authenticator-vault`).
2. Generate a **Personal Access Token (classic)** with the `repo` scope.
3. Open the **Cloud Sync** panel in the app and paste your token and repository path (`username/repo`).
4. The app will automatically sync your accounts and provide a persistent alert if the connection ever fails.

## 🛠️ Usage

- **Add Account**: Click the `+` icon to upload or drop a QR code image.
- **Copy Code**: Click an account card to copy the TOTP code. The item will expand on hover to show full details.
- **Sync**: Click **Cloud Sync** in the footer to manage your GitHub vault.
- **Privacy**: Use the Eye icon to mask/unmask your vault data instantly.
- **Export**: Use **Export File** to save a local backup of your secrets.
- **Reset**: Purge all local data using the **Reset Vault** action.

## 🔒 Security

Privacy is the core pillar of this extension.
- **Local First**: All data is stored in `chrome.storage.local`.
- **Private Cloud**: Synchronization uses your own private GitHub infrastructure—no third-party servers see your secrets.
- **Isolated Profiles**: Data from different Chrome profiles is saved in distinct files to prevent cross-contamination.
