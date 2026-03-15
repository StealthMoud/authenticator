# Skill: Chrome Extension Expert (MV3)

This skill provides specialized knowledge for high-security, high-performance Chrome Extensions.

## 1. Interaction Protocols
- **Always use `chrome.storage.local`** for persistence.
- **Service Worker Lifecycle**: Remember that background scripts in MV3 are ephemeral. State must be persisted to storage.
- **Manifest Validation**: Before recommending manifest changes, verify against the official MV3 schema.

## 2. Security Patterns
- No `eval()` or `new Function()`.
- Content Security Policy (CSP) must be strictly followed.
- For TOTP/Secret handling, use `otpauth` library logic and avoid exposing raw secrets in the UI.

## 3. UI Hooks
- Popups should use `window.close()` for dismissal.
- Options pages should use the `options_ui` manifest key with `open_in_tab: false` for a native feel.
