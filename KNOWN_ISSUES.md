# Known Issues

The following issues are currently known and remain unsupported in this build:

1. **Physical TV Verification**: Due to the target Samsung TV not being reachable via `sdb` (Smart Development Bridge) on the local network, the physical installation, stream resolution, AVPlay buffering, and D-pad interaction on an actual television have not been verified. Node.js unit and integration tests successfully validate the application logic, but physical testing is still required before full production rollout.
2. **Type 2 Streams**: Type 2 stream endpoints rely on Android `WebViewClient` request interception to discover the final media request. Tizen AVPlay cannot reproduce that Android-only flow, so these feeds are shown as unavailable instead of being sent to the player.
3. **Type 1 / ClearKey DRM**: The Android app defaults Type 1 feeds to MPEG-DASH ClearKey. The Frame 2022 runs Tizen 6.5, while Samsung lists MPEG-DASH ClearKey support from Tizen 9.0. Type 1 feeds are therefore shown as unavailable on this target TV. Widevine and PlayReady license handling is also not implemented in this port.
4. **Arbitrary Stream Headers**: Samsung AVPlay supports streaming properties such as `USER_AGENT` and `COOKIE`, but it does not provide a general API for arbitrary headers such as `Referer`, `Origin`, or `Authorization`. Feeds requiring those headers are shown as unavailable.
