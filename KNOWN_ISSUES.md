# Known Issues

The following feed types remain unsupported on the 2022 Frame:

1. **Android embed resolvers**: Some GeeSports feeds use an Android WebView to discover the final media request. These rows remain visible for honest navigation, but are marked unavailable instead of being sent to AVPlay.
2. **ClearKey DRM**: Many GeeSports feeds are MPEG-DASH ClearKey streams. The Frame 2022 runs Tizen 6.5, which cannot play these through AVPlay, so the app marks them unavailable and exposes compatible HLS alternatives when supplied by the backend.
3. **Other arbitrary stream headers**: Referer- and Origin-protected HLS feeds are handled by the configured LAN proxy. AVPlay still has no general API for unrelated headers such as `Authorization`; feeds requiring unsupported headers remain unavailable.
4. **Upstream availability**: The proxy supplies the headers requested by GeeSports, but it cannot repair an upstream source that is offline, expired, geo-blocked, or returning an error.
