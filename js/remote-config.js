(function (root) {
    "use strict";

    var config = root.SportzXConfig;

    function safeGet(key) {
        try {
            return root.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function safeSet(key, value) {
        try {
            root.localStorage.setItem(key, value);
        } catch (error) {
            // A disabled storage service must not prevent a live request.
        }
    }

    function safeRemove(key) {
        try {
            root.localStorage.removeItem(key);
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function parseJson(value, fallback) {
        try {
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function request(method, url, body, headers) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var settled = false;
            xhr.open(method, url, true);
            xhr.timeout = config.requestTimeoutMs;

            Object.keys(headers || {}).forEach(function (name) {
                xhr.setRequestHeader(name, headers[name]);
            });

            function fail(message) {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new Error(message));
            }

            xhr.onreadystatechange = function () {
                var payload;
                if (xhr.readyState !== 4 || settled) {
                    return;
                }
                settled = true;
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error("Configuration service returned HTTP " + xhr.status));
                    return;
                }
                try {
                    payload = JSON.parse(xhr.responseText || "{}");
                    resolve(payload);
                } catch (error) {
                    reject(new Error("Configuration service returned invalid JSON"));
                }
            };
            xhr.onerror = function () {
                fail("Configuration service is unreachable from this TV");
            };
            xhr.ontimeout = function () {
                fail("Configuration discovery timed out");
            };
            xhr.send(body ? JSON.stringify(body) : null);
        });
    }

    function randomFid() {
        var bytes = new Uint8Array(17);
        var binary = "";
        var i;

        if (!root.crypto || !root.crypto.getRandomValues) {
            throw new Error("Secure random generation is unavailable");
        }
        root.crypto.getRandomValues(bytes);
        bytes[0] = (bytes[0] & 15) | 112;
        for (i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return root.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
    }

    function installationHeaders() {
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Android-Package": config.packageName,
            "X-Android-Cert": config.firebase.androidCertSha1,
            "X-Goog-Api-Key": config.firebase.apiKey
        };
    }

    function expiresAt(expiresIn) {
        var seconds = parseInt(String(expiresIn || "3600s").replace("s", ""), 10);
        if (!isFinite(seconds) || seconds < 60) {
            seconds = 3600;
        }
        return Date.now() + (seconds - 60) * 1000;
    }

    function saveInstallation(response) {
        var auth = response.authToken || {};
        var record = {
            fid: response.fid,
            refreshToken: response.refreshToken,
            authToken: auth.token,
            authExpiresAt: expiresAt(auth.expiresIn)
        };
        safeSet(config.storage.firebaseInstallation, JSON.stringify(record));
        return record;
    }

    function createInstallation() {
        var fid = randomFid();
        var url = "https://firebaseinstallations.googleapis.com/v1/projects/" +
            config.firebase.projectId + "/installations";
        var body = {
            fid: fid,
            appId: config.firebase.appId,
            authVersion: "FIS_v2",
            sdkVersion: config.firebase.installationsSdk
        };
        return request("POST", url, body, installationHeaders()).then(saveInstallation);
    }

    function refreshInstallation(record) {
        var url = "https://firebaseinstallations.googleapis.com/v1/projects/" +
            config.firebase.projectId + "/installations/" + encodeURIComponent(record.fid) +
            "/authTokens:generate";
        var headers = installationHeaders();
        headers.Authorization = "FIS_v2 " + record.refreshToken;

        return request("POST", url, {
            installation: { sdkVersion: config.firebase.installationsSdk }
        }, headers).then(function (response) {
            record.authToken = response.token;
            record.authExpiresAt = expiresAt(response.expiresIn);
            safeSet(config.storage.firebaseInstallation, JSON.stringify(record));
            return record;
        });
    }

    function getInstallation() {
        var record = parseJson(safeGet(config.storage.firebaseInstallation), null);
        if (!record || !record.fid || !record.refreshToken) {
            return createInstallation();
        }
        if (record.authToken && record.authExpiresAt > Date.now()) {
            return Promise.resolve(record);
        }
        return refreshInstallation(record).catch(function () {
            safeRemove(config.storage.firebaseInstallation);
            return createInstallation();
        });
    }

    function localeParts() {
        var locale = (root.navigator.language || "en-US").split("-");
        return {
            languageCode: locale[0] || "en",
            countryCode: (locale[1] || "US").toUpperCase()
        };
    }

    function timeZoneName() {
        try {
            return root.Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch (error) {
            return "UTC";
        }
    }

    function fetchRemoteEntries(installation) {
        var locale = localeParts();
        var url = "https://firebaseremoteconfig.googleapis.com/v1/projects/" +
            config.firebase.projectNumber + "/namespaces/firebase:fetch";
        var headers = installationHeaders();
        headers["X-Goog-Firebase-Installations-Auth"] = installation.authToken;

        return request("POST", url, {
            appInstanceId: installation.fid,
            appInstanceIdToken: installation.authToken,
            appId: config.firebase.appId,
            countryCode: locale.countryCode,
            languageCode: locale.languageCode,
            platformVersion: String(root.navigator.platform || "Tizen"),
            timeZone: timeZoneName(),
            appVersion: config.appVersion,
            appBuild: config.appBuild,
            packageName: config.packageName,
            sdkVersion: config.firebase.remoteConfigSdk,
            analyticsUserProperties: {}
        }, headers).then(function (response) {
            var entries = response.entries || {};
            if (!entries.api_url) {
                throw new Error("The Android configuration does not contain api_url");
            }
            safeSet(config.storage.remoteEntries, JSON.stringify(entries));
            safeSet(config.storage.remoteFetchedAt, String(Date.now()));
            return entries;
        });
    }

    function normalizeBase(value) {
        var result = String(value || "").replace(/^\s+|\s+$/g, "");
        if (!/^https?:\/\//i.test(result)) {
            return "";
        }
        return result.replace(/\/+$/, "") + "/";
    }

    function resultFromEntries(entries, source) {
        var base = normalizeBase(entries && entries.api_url);
        if (!base) {
            throw new Error("The discovered API URL is not a valid HTTP address");
        }
        return {
            apiBase: base,
            userAgent: String(entries.userAgent || entries.user_agent || ""),
            source: source
        };
    }

    function fallbackResult() {
        var base = normalizeBase(config.fallbackApiBase);
        if (!base) {
            return null;
        }
        return {
            apiBase: base,
            userAgent: String(config.fallbackUserAgent || ""),
            source: "built-in fallback"
        };
    }

    function configured() {
        var override = normalizeBase(safeGet(config.storage.apiBase));
        var entries;
        if (override) {
            return {
                apiBase: override,
                userAgent: safeGet(config.storage.userAgent) || "",
                source: "override"
            };
        }
        entries = parseJson(safeGet(config.storage.remoteEntries), null);
        if (entries && entries.api_url) {
            return resultFromEntries(entries, "cache");
        }
        return fallbackResult();
    }

    function discover() {
        return getInstallation().then(fetchRemoteEntries).then(function (entries) {
            return resultFromEntries(entries, "remote");
        }).catch(function (error) {
            var cached = parseJson(safeGet(config.storage.remoteEntries), null);
            if (cached && cached.api_url) {
                return resultFromEntries(cached, "cache");
            }
            if (fallbackResult()) {
                return fallbackResult();
            }
            throw error;
        });
    }

    function saveOverride(apiBase, userAgent) {
        var base = normalizeBase(apiBase);
        if (!base) {
            throw new Error("Enter a complete http:// or https:// base URL");
        }
        safeSet(config.storage.apiBase, base);
        if (typeof userAgent === "string") {
            safeSet(config.storage.userAgent, userAgent);
        }
        return base;
    }

    function clearOverride() {
        safeRemove(config.storage.apiBase);
        safeRemove(config.storage.userAgent);
    }

    root.SportzXRemoteConfig = {
        configured: configured,
        discover: discover,
        saveOverride: saveOverride,
        clearOverride: clearOverride,
        normalizeBase: normalizeBase,
        _request: request,
        _randomFid: randomFid
    };
}(this));
