(function (root) {
    "use strict";

    // Copy this file to proxy-private.js and set the token from
    // /etc/sportszx-proxy.env. proxy-private.js is intentionally ignored.
    if (root.SportzXConfig && root.SportzXConfig.streamProxy) {
        root.SportzXConfig.streamProxy.token = "replace-with-proxy-token";
    }
}(this));
