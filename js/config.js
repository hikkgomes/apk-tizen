(function (root) {
    "use strict";

    root.SportzXConfig = {
        appVersion: "3.8",
        appBuild: "11",
        packageName: "com.live.geesports",
        // GeeSports' current production endpoint. Remote Config can update it
        // without requiring another TV build.
        fallbackApiBase: "https://api.whatyouthink.site/",
        fallbackUserAgent: "Mozilla/5.0 (SmartTV; SmartTV) AppleWebKit/537.42 Tizen/6.5",
        streamProxy: {
            baseUrl: "http://192.168.1.41:8099/hls",
            token: ""
        },
        firebase: {
            projectId: "gee-sports-dcc62",
            projectNumber: "723237950983",
            appId: "1:723237950983:android:84dfd1ce9f6664417bfca2",
            apiKey: "AIzaSyDzfPo4ElrL-uZViIScGwfBnpJ-pADNJ5U",
            androidCertSha1: "391F924B34394C0C2B8AD7FD7874068B9D575A08",
            installationsSdk: "a:17.2.0",
            remoteConfigSdk: "22.1.2"
        },
        storage: {
            apiBase: "geesports.apiBase",
            userAgent: "geesports.userAgent",
            remoteEntries: "geesports.remoteEntries",
            remoteFetchedAt: "geesports.remoteFetchedAt",
            firebaseInstallation: "geesports.firebaseInstallation"
        },
        refreshIntervalMs: 5 * 60 * 1000,
        requestTimeoutMs: 15000
    };
}(this));
