# Authenticator

Authenticator is a professional Chrome extension designed to provide a secure and efficient way to manage Two-Factor Authentication (2FA) codes directly within your browser. It features advanced image processing to detect QR codes from phone screenshots and natively supports the Google Authenticator migration format.

## Features

- QR Code Image Import: Import accounts by uploading or dragging screenshots of TOTP setup QR codes.
- Screenshot Detection: Optimized image processing handles high-resolution phone screenshots and varying contrast.
- Migration Support: Seamlessly imports multiple accounts using the Google Authenticator export format (otpauth-migration).
- Real-Time Synchronization: Automatically generates 6-digit TOTP codes with a global countdown timer.
- Secure Local Storage: All account secrets are stored exclusively in the browser's local storage and never leaves your device.
- Search Functionality: Quickly find specific accounts using the built-in filtering system.
- One-Click Copy: Click any account card to instantly copy the code to your clipboard.

## Installation

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to chrome://extensions/.
3. Enable 'Developer mode' using the toggle in the top-right corner.
4. Click 'Load unpacked' and select the directory containing the extension files.

## Usage

### Syncing from a Phone
1. Open your authenticator app on your mobile device.
2. Select the option to export accounts.
3. Take a screenshot of the generated QR code.
4. Open the Authenticator extension in your browser.
5. Click the import button and upload your screenshot.

### Adding New Accounts
You can also import standard TOTP setup QR codes provided by websites during their 2F setup process by saving the QR as an image and importing it here.

## Technical Details

- Manifest Version: 3
- Core Logic: Vanilla JavaScript
- Styling: Modern CSS with glassmorphism aesthetics
- Dependencies: jsQR for image processing, OTPAuth for code generation

## Privacy and Security

Authenticator is designed with privacy as a priority. Authentication secrets are stored locally on your machine. There is no external tracking, telemetry, or cloud synchronization involved.

## License

This project is licensed under the MIT License.
