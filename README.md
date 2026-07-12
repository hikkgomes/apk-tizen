# SportzX TV - Live Event Guide (Tizen OS)

SportzX TV is a premium, stadium-like live sports event guide and playback application tailored for Samsung Tizen Smart TVs (10-foot, 16:9 canvas). It discovers, decodes, and plays live broadcast feeds with custom request routing, cookie authorization, and hardware-accelerated Tizen AVPlay.

---

## 🚀 Features

- **Automated API Discovery**: Resolves production SportzX API endpoints dynamically via Firebase Remote Config.
- **Envelope Decryption**: Decrypts secure API payloads in real-time.
- **TV-Optimised Navigation**: Implements fully spatial 5-way D-pad remote navigation with focus tracking and back-button behavior.
- **Advanced Playback**: Integrated Samsung AVPlay supporting custom Cookies and User-Agent headers, with fallback to standard HTML5 `<video>` for browser development.
- **Robust Error Handling**: Dedicated fallback states for network offline, resolver failures, and unsupported codecs.

---

## 📁 Project Structure

```
sportszx/
├── assets/
│   ├── fonts/           # Nunito and Nunito-Medium typography files
│   └── images/          # Brand mark SVG
├── css/
│   └── app.css          # TV UI stylesheets and animations
├── js/
│   ├── config.js        # Static configuration (Firebase SDK info, etc.)
│   ├── decoder.js       # Envelope decryption utility (AES-256-CBC)
│   ├── remote-config.js # Dynamic URL discovery from Firebase Remote Config
│   ├── api-client.js    # API communication client
│   ├── navigation.js    # Remote control focus & navigation manager
│   ├── avplay-player.js # Samsung AVPlay player wrapper
│   └── app.js           # Main application coordinator
├── test/
│   ├── decoder.test.js  # Static unit tests for envelope decoder
│   └── api-client.js    # Live API integration tests
├── config.xml           # Tizen application manifest
├── icon.png             # Application launcher icon
├── README.md            # Project guide
└── .gitignore           # Git ignore file
```

---

## 🛠️ Testing

The application includes two test suites run directly via Node.js's built-in test runner:

### 1. Static Decoder Tests
Tests Base64 URL decoding, envelope parsing, key derivation, and AES decryption using a mock vector:
```bash
node test/decoder.test.js
```

### 2. Live API Integration Tests
Runs end-to-end integration tests by hitting the live Firebase Remote Config, discovering the active API base, retrieving the live fixtures list, decrypting the response, querying streams for a live match, and resolving streaming links:
```bash
node test/api-client.test.js
```

---

## 📦 Building and Packaging (.wgt)

Tizen web apps are packaged as Widget (`.wgt`) zip archives and must be cryptographically signed.

### Step 1: Package the Widget (Unsigned)
Zip the app contents into a `.wgt` archive (excluding git/test files and raw APK analysis tools):
```bash
zip -r SportzXTV.wgt assets css js index.html config.xml icon.png -x "*.DS_Store"
```

### Step 2: Configure Tizen CLI Security Profile
Before signing, add a security profile using the Tizen SDK CLI. You can use your existing developer certificate located in your Downloads folder:
```bash
tizen security-profiles add \
  -n SportzXProfile \
  -a ~/Downloads/DE_OLIVEIRA_GOMES_HENRIQUE___Z2810041K.p12 \
  -p <your_certificate_password>
```

### Step 3: Sign the WGT Package
Sign the package with your profile:
```bash
tizen package -t wgt -s SportzXProfile -- SportzXTV.wgt
```

---

## 📺 Sideloading onto Samsung TV

### Option A: Using the Tizen Studio CLI
1. Enable **Developer Mode** on your Samsung TV (open the Apps panel, press `12345` on the remote, set to **ON**, and input your PC's IP address). Reboot the TV.
2. Connect to the TV:
   ```bash
   sdb connect <tv_ip_address>
   ```
3. Install the signed package:
   ```bash
   tizen install -n SportzXTV.wgt -t <tv_device_name>
   ```

### Option B: Using the TizenBrew Installer
Launch `TizenBrewInstaller-macos-arm64` located in your Downloads, configure your TV's developer settings, and use its web UI (`http://localhost:8091`) to select and flash `SportzXTV.wgt` directly.
