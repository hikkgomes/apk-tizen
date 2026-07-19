# Known Issues

The following feed types remain unsupported on the 2022 Frame:

1. **Android embed resolvers**: Some GeeSports feeds use an Android WebView to discover the final media request. These rows remain visible for honest navigation, but are marked unavailable instead of being sent to AVPlay.
2. **ClearKey DRM**: Many GeeSports feeds are MPEG-DASH ClearKey streams. The Frame 2022 runs Tizen 6.5, which cannot play these through AVPlay, so the app marks them unavailable and exposes compatible HLS alternatives when supplied by the backend.
3. **Arbitrary stream headers**: AVPlay supports streaming properties such as `USER_AGENT` and `COOKIE`, but it does not provide a general API for headers such as `Referer`, `Origin`, or `Authorization`. Feeds requiring those headers are marked unavailable.
