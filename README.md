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

Tizen web apps are packaged as Widget (`.wgt`) zip archives and must be cryptographically signed with both an Author Certificate and a Samsung Distributor Certificate. An author certificate alone is **not enough**. The distributor certificate must be linked to your specific television's Unique Device ID (DUID).

### Step 1: Connect to the TV and Find the DUID
1. Enable **Developer Mode** on your Samsung TV (open the Apps panel, press `12345` on the remote, set to **ON**, and input your PC's IP address). Reboot the TV.
2. Connect to the TV using the Smart Development Bridge (`sdb`):
   ```bash
   sdb connect <tv_ip_address>
   ```
3. List connected devices to ensure connection and find the device name:
   ```bash
   sdb devices
   ```
4. Get the TV's DUID (replace `<tv_device_name>` with the name from the previous step):
   ```bash
   sdb -s <tv_device_name> shell default_get_duid
   ```

### Step 2: Create a Samsung Certificate Profile
Use the Tizen Studio Certificate Manager to create a proper security profile containing both certificates:
1. Open Tizen Studio Certificate Manager.
2. Create a new Samsung certificate profile (e.g., `SportzXProfile`).
3. Import your Author Certificate (`/path/to/author-certificate.p12`).
4. Generate a new Samsung Distributor Certificate, ensuring you add your TV's DUID to the allowed devices list.

### Step 3: Build the Project
Use the Tizen CLI to build the web application into a staging directory:
```bash
tizen build-web -- /path/to/project
```

### Step 4: Package the Signed .wgt
Package the `.buildResult` directory and sign it with your security profile:
```bash
tizen package -t wgt -s SportzXProfile -- /path/to/project/.buildResult
```
This will generate `SportzX TV.wgt` inside the `.buildResult` directory.

---

## 📺 Sideloading and Testing

### Installing the Package
Install the signed widget onto your connected TV:
```bash
tizen install -n "/path/to/project/.buildResult/SportzX TV.wgt" -t <tv_device_name>
```

### Reading Application Logs
To view JavaScript console logs and debug the application while it's running on the TV:
```bash
sdb -s <tv_device_name> dlog
```
