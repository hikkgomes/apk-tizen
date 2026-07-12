(function (root) {
    "use strict";

    function own(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function trim(value) {
        return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
    }

    function joinUrl(base, path) {
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(trim(value));
    }

    function safeHeader(xhr, name, value) {
        var lower = String(name).toLowerCase();
        var forbidden = {
            "accept-encoding": true,
            "connection": true,
            "content-length": true,
            "cookie": true,
            "host": true,
            "origin": true,
            "referer": true,
            "user-agent": true
        };
        if (!forbidden[lower]) {
            try {
                xhr.setRequestHeader(name, value);
            } catch (error) {
                // Some TV web engines reject additional restricted headers.
            }
        }
    }

    function xhrText(method, url, headers, timeoutMs) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var settled = false;

            if (!isHttpUrl(url)) {
                reject(new Error("Refusing a non-HTTP endpoint"));
                return;
            }

            xhr.open(method || "GET", url, true);
            xhr.timeout = timeoutMs || 15000;
            Object.keys(headers || {}).forEach(function (name) {
                safeHeader(xhr, name, String(headers[name]));
            });

            function fail(message, code) {
                var error;
                if (settled) {
                    return;
                }
                settled = true;
                error = new Error(message);
                error.code = code;
                error.url = url;
                reject(error);
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4 || settled) {
                    return;
                }
                if (xhr.status < 200 || xhr.status >= 300) {
                    fail("The service returned HTTP " + xhr.status, "HTTP_" + xhr.status);
                    return;
                }
                settled = true;
                resolve(xhr.responseText || "");
            };
            xhr.onerror = function () {
                fail("The TV could not reach this address. The service may reject CORS requests.", "NETWORK");
            };
            xhr.ontimeout = function () {
                fail("The request timed out", "TIMEOUT");
            };
            xhr.send(null);
        });
    }

    function parseJson(text, label) {
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error((label || "Response") + " is not valid JSON");
        }
    }

    function decodeResponse(text) {
        var parsed = parseJson(text, "API response");
        var encoded;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.data !== "string") {
            return Promise.resolve(parsed);
        }

        encoded = parsed.data;
        if (!root.SportzXDecoder || !root.SportzXDecoder.decodeEnvelope) {
            return Promise.reject(new Error("The response decoder did not load"));
        }

        return root.SportzXDecoder.decodeEnvelope(encoded).then(function (decoded) {
            return parseJson(decoded, "Decoded API response");
        }).catch(function (decodeError) {
            try {
                return JSON.parse(encoded);
            } catch (jsonError) {
                throw decodeError;
            }
        });
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function asString(value, fallback) {
        return value == null ? (fallback || "") : String(value);
    }

    function normalizeFormat(value, index) {
        if (typeof value === "string") {
            return { title: value, logo: "", index: index };
        }
        value = value || {};
        return {
            title: asString(value.title, "Feed " + (index + 1)),
            logo: asString(value.logo),
            index: index
        };
    }

    function normalizeEvent(value, index) {
        var info = value && value.eventInfo || {};
        var formats = asArray(value && value.formats);
        var formatsNew = asArray(value && value.formatsNew);
        return {
            id: asString(value && value.id, String(index)),
            cat: asString(value && value.cat, "Other"),
            catImage: asString(value && value.catImage),
            adsLimit: Number(value && value.adsLimit) || 0,
            formats: formats.map(normalizeFormat),
            formatsNew: formatsNew.map(normalizeFormat),
            eventInfo: {
                teamA: asString(info.teamA),
                teamB: asString(info.teamB),
                teamAFlag: asString(info.teamAFlag),
                teamBFlag: asString(info.teamBFlag),
                eventName: asString(info.eventName, asString(info.teamA) + " vs " + asString(info.teamB)),
                eventType: asString(info.eventType),
                eventBanner: asString(info.eventBanner),
                isHot: Boolean(info.isHot),
                startTime: asString(info.startTime),
                endTime: asString(info.endTime)
            },
            raw: value
        };
    }

    function normalizeCategory(value, index) {
        return {
            id: asString(value && value.id, String(index)),
            title: asString(value && value.title, "Other"),
            image: asString(value && value.image),
            selected: Boolean(value && value.isChecked),
            link: asString(value && value.catLink)
        };
    }

    function normalizeStream(value, index) {
        value = value || {};
        return {
            title: asString(value.title, "Feed " + (index + 1)),
            link: asString(value.link),
            type: Number(value.type) || 0,
            api: asString(value.api),
            drmType: value.drmType == null ? null : String(value.drmType),
            headers: value.headers && typeof value.headers === "object" ? value.headers : {},
            index: index,
            raw: value
        };
    }

    function parseEventTime(value) {
        var match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(trim(value));
        var offset;
        var utc;
        var parsed;
        if (match) {
            offset = (Number(match[8]) * 60) + Number(match[9]);
            if (match[7] === "-") {
                offset = -offset;
            }
            utc = Date.UTC(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4]),
                Number(match[5]),
                Number(match[6])
            ) - offset * 60000;
            return new Date(utc);
        }
        parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    function finalPathSegment(url) {
        var clean = String(url || "").split("?")[0].replace(/\/+$/, "");
        var pieces = clean.split("/");
        return pieces[pieces.length - 1] || "";
    }

    function replaceApiToken(template, link) {
        var token = finalPathSegment(link);
        return String(template || "").replace(/%s/g, token);
    }

    function decodeEscapedUrl(value) {
        return String(value || "")
            .replace(/\\u0026/gi, "&")
            .replace(/\\\//g, "/")
            .replace(/&amp;/g, "&");
    }

    function streamKind(stream) {
        var url = String(stream.link || "").toLowerCase().split("?")[0];
        if (/\.mpd$/.test(url)) {
            return "DASH";
        }
        if (/\.m3u8$/.test(url)) {
            return "HLS";
        }
        if (stream.drmType) {
            return String(stream.drmType).toUpperCase();
        }
        return "LIVE";
    }

    function SportzXApi(options) {
        options = options || {};
        this.baseUrl = String(options.baseUrl || "");
        this.userAgent = String(options.userAgent || "");
        this.timeoutMs = Number(options.timeoutMs) || 15000;
    }

    SportzXApi.prototype.get = function (path) {
        return xhrText("GET", joinUrl(this.baseUrl, path), {}, this.timeoutMs).then(decodeResponse);
    };

    SportzXApi.prototype.getEvents = function () {
        return this.get("events.json").then(function (payload) {
            if (!Array.isArray(payload)) {
                throw new Error("events.json did not contain an event list");
            }
            return payload.map(normalizeEvent);
        });
    };

    SportzXApi.prototype.getEventCategories = function () {
        return this.get("eventCats.json").then(function (payload) {
            if (!Array.isArray(payload)) {
                return [];
            }
            return payload.map(normalizeCategory);
        });
    };

    SportzXApi.prototype.getGuide = function () {
        var self = this;
        return Promise.all([
            self.getEvents(),
            self.getEventCategories().catch(function () { return []; })
        ]).then(function (parts) {
            return { events: parts[0], categories: parts[1] };
        });
    };

    SportzXApi.prototype.getStreams = function (event) {
        var self = this;
        var plainPath = "channels/" + encodeURIComponent(event.id) + ".json";
        var preferredPath = event.adsLimit > 0 ? "channels/" + encodeURIComponent(event.id) + "e.json" : plainPath;

        function load(path) {
            return self.get(path).then(function (payload) {
                if (!Array.isArray(payload)) {
                    throw new Error("The channel response did not contain a feed list");
                }
                return payload.map(normalizeStream).filter(function (stream) {
                    return Boolean(stream.link);
                });
            });
        }

        return load(preferredPath).catch(function (error) {
            if (preferredPath === plainPath) {
                throw error;
            }
            return load(plainPath);
        });
    };

    SportzXApi.prototype.resolveStream = function (stream) {
        var self = this;
        var type = Number(stream.type) || 0;
        var resolved = {
            title: stream.title,
            link: stream.link,
            type: type,
            api: stream.api,
            drmType: stream.drmType,
            headers: stream.headers || {},
            index: stream.index
        };

        if (type === 2) {
            return Promise.reject((function () {
                var error = new Error("This feed depends on Android WebView request interception, which is unavailable in a standalone TV app.");
                error.code = "ANDROID_WEBVIEW_REQUIRED";
                return error;
            }()));
        }

        if (type === 4) {
            if (!resolved.api) {
                return Promise.resolve(resolved);
            }
            return xhrText("GET", replaceApiToken(resolved.api, resolved.link), resolved.headers, self.timeoutMs).then(function (text) {
                var payload = parseJson(text, "Playback resolver response");
                if (!payload.playback_url) {
                    throw new Error("The playback resolver did not return playback_url");
                }
                resolved.link = String(payload.playback_url);
                return resolved;
            }).catch(function () {
                return resolved;
            });
        }

        if (type === 6) {
            return xhrText("GET", resolved.link, resolved.headers, self.timeoutMs).then(function (text) {
                var match = /["']hlsManifestUrl["']\s*:\s*["']([^"']+)["']/.exec(text);
                if (!match) {
                    throw new Error("No HLS manifest was found in the feed page");
                }
                resolved.link = decodeEscapedUrl(match[1]);
                return resolved;
            }).catch(function () {
                return resolved;
            });
        }

        return Promise.resolve(resolved);
    };

    SportzXApi.prototype.playbackOptions = function (stream) {
        var headers = stream.headers || {};
        var result = { userAgent: this.userAgent, cookie: "" };
        Object.keys(headers).forEach(function (name) {
            var lower = name.toLowerCase();
            if (lower === "user-agent") {
                result.userAgent = String(headers[name]);
            } else if (lower === "cookie") {
                result.cookie = String(headers[name]);
            }
        });
        return result;
    };

    root.SportzXApi = SportzXApi;
    root.SportzXApiUtils = {
        decodeResponse: decodeResponse,
        joinUrl: joinUrl,
        normalizeEvent: normalizeEvent,
        normalizeStream: normalizeStream,
        parseEventTime: parseEventTime,
        streamKind: streamKind,
        xhrText: xhrText
    };
}(this));
