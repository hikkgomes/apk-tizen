# Known Issues

The following issues are currently known and remain unsupported in this build:

1. **Physical TV Verification**: Due to the target Samsung TV not being reachable via `sdb` (Smart Development Bridge) on the local network, the physical installation, stream resolution, AVPlay buffering, and D-pad interaction on an actual television have not been verified. Node.js unit and integration tests successfully validate the application logic, but physical testing is still required before full production rollout.
2. **Type 2 Streams**: Type 2 (Web Video Caster / Android WebView) stream endpoints rely on Android's `WebViewClient` request interception mechanisms to bypass CORS and evaluate dynamically injected Javascript payload tokens. Tizen Web Engine (Chromium) and AVPlay do not support these interception mechanisms, making Type 2 feeds explicitly unsupported on Smart TVs.
3. **Advanced DRM**: Playback of specific Widevine or PlayReady DRM-encrypted streams using `COMPONENT=WV` or `COMPONENT=PR` has not been fully mapped into the generic AVPlay wrapper, meaning highly secured channels might fail to acquire licenses.
