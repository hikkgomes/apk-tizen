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
        var parsed;
        var encoded;
        try {
            parsed = JSON.parse(text);
        } catch (jsonError) {
            if (!root.SportzXDecoder || !root.SportzXDecoder.decodeGeeSportsPayload) {
                return Promise.reject(new Error("The GeeSports response decoder did not load"));
            }
            return root.SportzXDecoder.decodeGeeSportsPayload(text).then(function (decoded) {
                return parseJson(decoded, "Decoded GeeSports response");
            });
        }
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
        var geeValue;
        var info = value && value.eventInfo || {};
        var formats = asArray(value && value.formats);
        var formatsNew = asArray(value && value.formatsNew);

        if (value && typeof value.event === "string") {
            try {
                geeValue = JSON.parse(value.event);
            } catch (error) {
                geeValue = null;
            }
        } else if (value && value.eventName && value.links) {
            geeValue = value;
        }

        if (geeValue) {
            formats = asArray(geeValue.link_names);
            return {
                id: asString(geeValue.links, "event-" + index),
                cat: asString(geeValue.category, "Other"),
                catImage: "",
                adsLimit: 0,
                formats: formats.map(normalizeFormat),
                formatsNew: [],
                eventInfo: {
                    teamA: asString(geeValue.teamAName),
                    teamB: asString(geeValue.teamBName),
                    teamAFlag: asString(geeValue.teamAFlag),
                    teamBFlag: asString(geeValue.teamBFlag),
                    eventName: asString(geeValue.eventName, asString(geeValue.teamAName) + " vs " + asString(geeValue.teamBName)),
                    eventType: asString(geeValue.category),
                    eventBanner: asString(geeValue.eventLogo),
                    isHot: Number(geeValue.priority) > 0,
                    startTime: trim(asString(geeValue.date) + " " + asString(geeValue.time)),
                    endTime: trim(asString(geeValue.end_date) + " " + asString(geeValue.end_time))
                },
                visible: geeValue.visible !== false,
                priority: Number(geeValue.priority) || 0,
                streamPath: asString(geeValue.links),
                raw: geeValue
            };
        }
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
                eventType: String(info.eventType == null ? "" : info.eventType).toLowerCase() === "null" ? "" : asString(info.eventType),
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

    function decodeHeaderPart(value) {
        var input = String(value == null ? "" : value).replace(/\+/g, " ");
        try {
            return decodeURIComponent(input);
        } catch (error) {
            return input;
        }
    }

    function setHeader(headers, name, value) {
        var lower = String(name).toLowerCase();
        Object.keys(headers).forEach(function (existing) {
            if (existing.toLowerCase() === lower) {
                delete headers[existing];
            }
        });
        headers[name] = value;
    }

    // The Android app accepts ExoPlayer-style URLs such as:
    // https://host/live.m3u8|Referer=https%3A%2F%2Fsite%2F&User-Agent=...
    function parseStreamLink(value, suppliedHeaders) {
        var input = trim(value);
        var pipeIndex = input.indexOf("|");
        var headers = {};
        var suffix = "";

        Object.keys(suppliedHeaders || {}).forEach(function (name) {
            setHeader(headers, name, String(suppliedHeaders[name]));
        });

        if (pipeIndex !== -1) {
            suffix = input.slice(pipeIndex + 1);
            input = input.slice(0, pipeIndex);
            suffix.split("&").forEach(function (pair) {
                var equalsIndex = pair.indexOf("=");
                var name;
                if (equalsIndex <= 0) {
                    return;
                }
                name = trim(decodeHeaderPart(pair.slice(0, equalsIndex)));
                if (name) {
                    setHeader(headers, name, decodeHeaderPart(pair.slice(equalsIndex + 1)));
                }
            });
        }

        return { link: trim(input).replace(/\?$/, ""), headers: headers };
    }

    function normalizeStream(value, index) {
        var parsed;
        var clearKey;
        var tokenConfig = {};
        var tokenType;
        value = value || {};
        if (typeof value.tokenApi === "string" && trim(value.tokenApi)) {
            try {
                tokenConfig = JSON.parse(value.tokenApi);
            } catch (error) {
                tokenConfig = {};
            }
        } else if (value.tokenApi && typeof value.tokenApi === "object") {
            tokenConfig = value.tokenApi;
        }
        tokenType = trim(tokenConfig.type).toLowerCase();
        parsed = parseStreamLink(
            value.link || tokenConfig.url || tokenConfig.api,
            value.headers && typeof value.headers === "object" ? value.headers : {}
        );
        clearKey = /^[0-9a-f]{32}:[0-9a-f]{32}$/i.test(trim(value.api)) ? trim(value.api) : "";
        return {
            title: asString(value.title, asString(value.name, "Feed " + (index + 1))),
            link: parsed.link,
            type: clearKey ? 1 : (tokenType === "embed" ? 2 : (Number(value.type) || 0)),
            api: asString(value.api),
            drmType: clearKey ? "clearkey" : (value.drmType == null ? null : String(value.drmType)),
            clearKey: clearKey,
            scheme: Number(value.scheme) || 0,
            tokenConfig: tokenConfig,
            headers: parsed.headers,
            index: index,
            raw: value
        };
    }

    function parseEventTime(value) {
        var match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(trim(value));
        var localMatch;
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
        localMatch = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(trim(value));
        if (localMatch) {
            parsed = new Date(
                Number(localMatch[3]),
                Number(localMatch[2]) - 1,
                Number(localMatch[1]),
                Number(localMatch[4] || 0),
                Number(localMatch[5] || 0),
                Number(localMatch[6] || 0)
            );
            return isNaN(parsed.getTime()) ? null : parsed;
        }
        parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    function isEventExpired(event, now) {
        var info = event && event.eventInfo || {};
        var end = parseEventTime(info.endTime);
        var start = parseEventTime(info.startTime);
        var current = now instanceof Date ? now : new Date();
        if (!end && start) {
            end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
        }
        return Boolean(end && current.getTime() > end.getTime());
    }

    function isEventLive(event, now) {
        var info = event && event.eventInfo || {};
        var current = now instanceof Date ? now : new Date();
        var start;
        var end;
        if (info.eventType && String(info.eventType).toLowerCase().indexOf("live") !== -1) {
            return true;
        }
        start = parseEventTime(info.startTime);
        end = parseEventTime(info.endTime);
        if (!start) {
            return false;
        }
        if (!end) {
            return current >= start && current.getTime() <= start.getTime() + 4 * 60 * 60 * 1000;
        }
        return current >= start && current <= end;
    }

    function isEventToday(event, now) {
        var start = parseEventTime(event && event.eventInfo && event.eventInfo.startTime);
        var current = now instanceof Date ? now : new Date();
        return Boolean(start && start.getFullYear() === current.getFullYear() &&
            start.getMonth() === current.getMonth() && start.getDate() === current.getDate());
    }

    function isEventUpcoming(event, now) {
        var start = parseEventTime(event && event.eventInfo && event.eventInfo.startTime);
        var current = now instanceof Date ? now : new Date();
        return Boolean(start && start > current);
    }

    function filterGuideEvents(events, category, status, now) {
        var current = now instanceof Date ? now : new Date();
        var categoryEvents = asArray(events).filter(function (event) {
            return category === "All" || event.cat === category;
        });
        var filtered;

        if (status === "Live") {
            filtered = categoryEvents.filter(function (event) { return isEventLive(event, current); });
        } else if (status === "Today") {
            filtered = categoryEvents.filter(function (event) {
                return isEventToday(event, current) || isEventLive(event, current);
            });
        } else if (status === "Upcoming") {
            filtered = categoryEvents.filter(function (event) {
                return isEventUpcoming(event, current) && !isEventLive(event, current);
            });
        } else {
            filtered = categoryEvents.slice();
        }

        return { events: filtered, scheduleStale: false };
    }

    function finalPathSegment(url) {
        var clean = parseStreamLink(url).link.split("?")[0].replace(/\/+$/, "");
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
        var url = parseStreamLink(stream.link).link.toLowerCase().split("?")[0];
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

    function streamSupport(stream) {
        var type = Number(stream && stream.type) || 0;
        var parsed = parseStreamLink(stream && stream.link, stream && stream.headers);
        var unsupportedHeaders = [];
        var drmType = trim(stream && stream.drmType).toLowerCase();

        if (type === 2) {
            return {
                supported: false,
                code: "ANDROID_WEBVIEW_REQUIRED",
                reason: "Requires Android WebView capture"
            };
        }

        if (type === 1) {
            return {
                supported: false,
                code: drmType === "widevine" || drmType === "playready" ? "DRM_NOT_IMPLEMENTED" : "CLEARKEY_UNSUPPORTED",
                reason: drmType === "widevine" || drmType === "playready" ? "DRM feed is not supported by this port" : "ClearKey DASH is not supported by Samsung AVPlay"
            };
        }

        if (!isHttpUrl(parsed.link)) {
            return {
                supported: false,
                code: "INVALID_STREAM_URL",
                reason: "Invalid stream address"
            };
        }

        Object.keys(parsed.headers).forEach(function (name) {
            var lower = name.toLowerCase();
            if (lower !== "user-agent" && lower !== "cookie") {
                unsupportedHeaders.push(name);
            }
        });

        if (unsupportedHeaders.length) {
            return {
                supported: false,
                code: "CUSTOM_HEADERS_UNSUPPORTED",
                reason: "Needs unsupported header: " + unsupportedHeaders.join(", ")
            };
        }

        return { supported: true, code: "SUPPORTED", reason: "Compatible with Samsung AVPlay" };
    }

    function normalizeResolvedStream(stream) {
        var parsed = parseStreamLink(stream.link, stream.headers);
        stream.link = parsed.link;
        stream.headers = parsed.headers;
        return stream;
    }

    function unsupportedStreamError(stream) {
        var support = streamSupport(stream);
        var error;
        if (support.supported) {
            return null;
        }
        error = new Error(support.reason + ".");
        error.code = support.code;
        return error;
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
        return this.get("events.txt").then(function (payload) {
            var now = new Date();
            if (!Array.isArray(payload)) {
                throw new Error("events.txt did not contain an event list");
            }
            return payload.map(normalizeEvent).filter(function (event) {
                return event.visible !== false && Boolean(event.streamPath || event.id);
            }).sort(function (left, right) {
                var leftTime = parseEventTime(left.eventInfo.startTime);
                var rightTime = parseEventTime(right.eventInfo.startTime);
                var leftExpired = isEventExpired(left, now);
                var rightExpired = isEventExpired(right, now);
                if (leftExpired !== rightExpired) {
                    return leftExpired ? 1 : -1;
                }
                if (left.priority !== right.priority) {
                    return right.priority - left.priority;
                }
                return (leftTime ? leftTime.getTime() : Infinity) - (rightTime ? rightTime.getTime() : Infinity);
            });
        });
    };

    SportzXApi.prototype.getEventCategories = function () {
        return this.get("event_cats.txt").then(function (payload) {
            if (!Array.isArray(payload)) {
                return [];
            }
            return payload.map(normalizeCategory);
        });
    };

    SportzXApi.prototype.getGuide = function () {
        var self = this;
        return self.getEvents().then(function (events) {
            var seen = {};
            var categories = [];
            events.forEach(function (event) {
                if (!seen[event.cat]) {
                    seen[event.cat] = true;
                    categories.push({ id: event.cat, title: event.cat, image: event.catImage || "", selected: false, link: "" });
                }
            });
            return { events: events, categories: categories };
        });
    };

    SportzXApi.prototype.getStreams = function (event) {
        var self = this;
        var plainPath = event.streamPath || event.id;
        var preferredPath = plainPath;

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
        var supportError;

        normalizeResolvedStream(resolved);
        supportError = unsupportedStreamError(resolved);
        if (supportError) {
            return Promise.reject(supportError);
        }

        if (type === 4) {
            if (!resolved.api) {
                return Promise.reject(new Error("Stream type 4 missing API URL"));
            }
            return xhrText("GET", replaceApiToken(resolved.api, resolved.link), resolved.headers, self.timeoutMs).then(function (text) {
                var payload = parseJson(text, "Playback resolver response");
                if (!payload.playback_url) {
                    throw new Error("The playback resolver did not return playback_url");
                }
                resolved.link = String(payload.playback_url);
                normalizeResolvedStream(resolved);
                supportError = unsupportedStreamError(resolved);
                if (supportError) {
                    throw supportError;
                }
                return resolved;
            }).catch(function (err) {
                throw new Error("Type 4 stream resolution failed: " + err.message);
            });
        }

        if (type === 6) {
            return xhrText("GET", resolved.link, resolved.headers, self.timeoutMs).then(function (text) {
                var match = /["']hlsManifestUrl["']\s*:\s*["']([^"']+)["']/.exec(text);
                if (!match) {
                    throw new Error("No HLS manifest was found in the feed page");
                }
                resolved.link = decodeEscapedUrl(match[1]);
                normalizeResolvedStream(resolved);
                supportError = unsupportedStreamError(resolved);
                if (supportError) {
                    throw supportError;
                }
                return resolved;
            }).catch(function (err) {
                throw new Error("Type 6 stream extraction failed: " + err.message);
            });
        }

        return Promise.resolve(resolved);
    };

    SportzXApi.prototype.playbackOptions = function (stream) {
        var headers = stream.headers || {};
        var result = {
            title: stream.title || "",
            streamType: Number(stream.type) || 0,
            drmType: stream.drmType || "",
            userAgent: this.userAgent,
            cookie: "",
            customHeaders: {}
        };
        Object.keys(headers).forEach(function (name) {
            var lower = name.toLowerCase();
            if (lower === "user-agent") {
                result.userAgent = String(headers[name]);
            } else if (lower === "cookie") {
                result.cookie = String(headers[name]);
            } else {
                result.customHeaders[name] = String(headers[name]);
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
        filterGuideEvents: filterGuideEvents,
        isEventExpired: isEventExpired,
        isEventLive: isEventLive,
        isEventToday: isEventToday,
        isEventUpcoming: isEventUpcoming,
        parseStreamLink: parseStreamLink,
        parseEventTime: parseEventTime,
        streamKind: streamKind,
        streamSupport: streamSupport,
        xhrText: xhrText
    };
}(this));
