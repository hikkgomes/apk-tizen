(function (root) {
    "use strict";

    var playerElement = null;
    var htmlPlayer = null;
    var isTizen = false;
    var currentUrl = null;
    var callbacks = {};
    var isPrepared = false;
    var isBufferComplete = true;

    function sanitizeUrl(url) {
        if (!url) return "null";
        try {
            var parsed = new URL(url);
            return parsed.protocol + "//" + parsed.hostname + parsed.pathname;
        } catch (e) {
            return "invalid_url";
        }
    }

    function log(msg) {
        console.log("[SportzXPlayer] " + msg);
    }

    function init(opts) {
        callbacks = opts || {};
        playerElement = document.getElementById("av-player");
        htmlPlayer = document.getElementById("html-player");

        isTizen = Boolean(root.webapis && root.webapis.avplay);

        if (isTizen) {
            log("Detected Tizen AVPlay environment");
            if (htmlPlayer) {
                htmlPlayer.classList.add("is-hidden");
            }
            if (playerElement) {
                playerElement.classList.remove("is-hidden");
            }
        } else {
            log("Detected standard browser environment, falling back to HTML5 Player");
            if (playerElement) {
                playerElement.classList.add("is-hidden");
            }
            if (htmlPlayer) {
                htmlPlayer.classList.remove("is-hidden");
                setupHtmlPlayerEvents();
            }
        }
    }

    function setupHtmlPlayerEvents() {
        if (!htmlPlayer) return;

        htmlPlayer.addEventListener("waiting", function () {
            if (callbacks.onBufferingStart) {
                callbacks.onBufferingStart();
            }
        });

        htmlPlayer.addEventListener("playing", function () {
            if (callbacks.onBufferingComplete) {
                callbacks.onBufferingComplete();
            }
        });

        htmlPlayer.addEventListener("timeupdate", function () {
            if (callbacks.onCurrentPlayTime && htmlPlayer.duration) {
                var currentMs = Math.floor(htmlPlayer.currentTime * 1000);
                var durationMs = Math.floor(htmlPlayer.duration * 1000);
                callbacks.onCurrentPlayTime(currentMs, durationMs);
            }
        });

        htmlPlayer.addEventListener("ended", function () {
            if (callbacks.onCompleted) {
                callbacks.onCompleted();
            }
        });

        htmlPlayer.addEventListener("error", function (e) {
            if (callbacks.onError) {
                var errMessage = "HTML5 playback error";
                if (htmlPlayer.error) {
                    switch (htmlPlayer.error.code) {
                        case htmlPlayer.error.MEDIA_ERR_ABORTED:
                            errMessage = "Playback aborted by user";
                            break;
                        case htmlPlayer.error.MEDIA_ERR_NETWORK:
                            errMessage = "Network error while downloading video";
                            break;
                        case htmlPlayer.error.MEDIA_ERR_DECODE:
                            errMessage = "Video decoding failed";
                            break;
                        case htmlPlayer.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            errMessage = "Format or feed source not supported";
                            break;
                    }
                }
                callbacks.onError(errMessage);
            }
        });
    }

    function play(url, options) {
        currentUrl = url;
        isPrepared = false;
        options = options || {};

        var sanitizedUrl = sanitizeUrl(url);
        var pathWithoutQuery = url.split("?")[0];
        var ext = pathWithoutQuery.split(".").pop().toLowerCase();
        
        var isHls = ext === "m3u8";
        var isDash = ext === "mpd";
        var streamFormat = isHls ? "HLS" : (isDash ? "DASH" : "UNKNOWN");
        
        var hasUserAgent = !!options.userAgent;
        var hasCookie = !!options.cookie;
        var customHeaderNames = options.customHeaders ? Object.keys(options.customHeaders) : [];
        
        var hasReferer = customHeaderNames.indexOf("Referer") !== -1 || customHeaderNames.indexOf("referer") !== -1;
        var hasOrigin = customHeaderNames.indexOf("Origin") !== -1 || customHeaderNames.indexOf("origin") !== -1;
        var hasAuth = customHeaderNames.indexOf("Authorization") !== -1 || customHeaderNames.indexOf("authorization") !== -1;
        var hasCustomHeaders = customHeaderNames.length > 0;

        var classificationResult = "UNKNOWN";
        if (!hasUserAgent && !hasCookie && !hasCustomHeaders) {
            classificationResult = isHls ? "DIRECT_HLS" : (isDash ? "DIRECT_DASH" : "UNKNOWN");
        } else if (hasCustomHeaders && (hasReferer || hasOrigin || hasAuth)) {
            classificationResult = "CUSTOM_HEADERS_REQUIRED_UNSUPPORTED";
        } else if (hasCookie && !hasCustomHeaders) {
            classificationResult = "COOKIE_ONLY";
        } else if (hasUserAgent && !hasCookie && !hasCustomHeaders) {
            classificationResult = "USER_AGENT_ONLY";
        } else if (hasCustomHeaders) {
            classificationResult = "CUSTOM_HEADERS_REQUIRED_UNSUPPORTED";
        }

        log("--- Stream Classification ---");
        log("Stream Title: " + (options.title || "Unknown"));
        log("Stream Type (Numeric): " + (options.streamType || "Unknown"));
        log("Sanitized Hostname: " + sanitizedUrl);
        log("Detected Extension: " + ext);
        log("Format: " + streamFormat);
        log("DRM Type: " + (options.drmType || "None"));
        log("Header Names Present: " + (customHeaderNames.length > 0 ? customHeaderNames.join(", ") : "None"));
        log("Cookie Exists: " + hasCookie);
        log("User-Agent Exists: " + hasUserAgent);
        log("Referer/Origin/Auth Required: " + (hasReferer || hasOrigin || hasAuth));
        log("Classification: " + classificationResult);
        log("-----------------------------");

        if (classificationResult === "CUSTOM_HEADERS_REQUIRED_UNSUPPORTED") {
            log("Architectural Limitation: Tizen AVPlay does not natively support custom headers like Referer/Origin.");
            if (callbacks.onError) {
                callbacks.onError("This stream requires unsupported custom headers (Referer/Origin).");
            }
            return;
        }

        if (isTizen) {
            try {
                // Ensure player starts from a clean state
                var initialState = "UNKNOWN";
                try {
                    initialState = root.webapis.avplay.getState();
                } catch(e) {}
                log("AVPlay State before play: " + initialState);
                
                if (initialState === "PLAYING" || initialState === "PAUSED") {
                    try { root.webapis.avplay.stop(); } catch(e) {}
                }
                if (initialState !== "NONE" && initialState !== "IDLE") {
                    try { root.webapis.avplay.close(); } catch(e) {}
                }

                log("Calling AVPlay open() with original unchanged URL");
                root.webapis.avplay.open(url);
                log("AVPlay open() completed successfully. Current State: " + root.webapis.avplay.getState());

                var screenWidth = window.innerWidth || 1920;
                var screenHeight = window.innerHeight || 1080;
                root.webapis.avplay.setDisplayRect(0, 0, screenWidth, screenHeight);
                root.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");

                if (options.userAgent) {
                    log("Setting officially documented property: USER_AGENT");
                    root.webapis.avplay.setStreamingProperty("USER_AGENT", options.userAgent);
                }
                if (options.cookie) {
                    log("Setting officially documented property: COOKIE");
                    root.webapis.avplay.setStreamingProperty("COOKIE", options.cookie);
                }

                var avplayListener = {
                    onbufferingstart: function () {
                        log("Callback: onbufferingstart");
                        isBufferComplete = false;
                        if (callbacks.onBufferingStart) callbacks.onBufferingStart();
                    },
                    onbufferingprogress: function (percent) {
                        log("Callback: onbufferingprogress - " + percent + "%");
                    },
                    onbufferingcomplete: function () {
                        log("Callback: onbufferingcomplete");
                        isBufferComplete = true;
                        if (callbacks.onBufferingComplete) callbacks.onBufferingComplete();
                    },
                    oncurrentplaytime: function (currentTimeMs) {
                        if (callbacks.onCurrentPlayTime) {
                            var durationMs = -1;
                            try { durationMs = root.webapis.avplay.getDuration(); } catch (e) {}
                            callbacks.onCurrentPlayTime(currentTimeMs, durationMs);
                        }
                    },
                    onstreamcompleted: function () {
                        log("Callback: onstreamcompleted");
                        if (callbacks.onCompleted) callbacks.onCompleted();
                    },
                    onerror: function (eventType) {
                        var state = "UNKNOWN";
                        try { state = root.webapis.avplay.getState(); } catch (e) {}
                        log("Callback: onerror (" + eventType + ") in state: " + state);
                        if (callbacks.onError) callbacks.onError("AVPlay error (" + eventType + ")");
                    },
                    onerrormsg: function (errorCode, errorMsg) {
                        var state = "UNKNOWN";
                        try { state = root.webapis.avplay.getState(); } catch (e) {}
                        log("Callback: onerrormsg - Code: " + errorCode + ", Msg: " + errorMsg + ", State: " + state);
                    },
                    onevent: function (eventType, eventData) {
                        if (eventType === "PLAYER_MSG_HTTP_ERROR_CODE" ||
                            eventType === "PLAYER_MSG_HTTP_ERROR" ||
                            eventType === "PLAYER_MSG_RESOURCE_ERROR" ||
                            eventType === "PLAYER_MSG_BITRATE_CHANGE" ||
                            eventType === "PLAYER_MSG_STREAM_INFO_READY") {
                            log("Callback: onevent - " + eventType + " (Data: " + eventData + ")");
                        } else {
                            log("Callback: onevent - " + eventType);
                        }
                    },
                    ondrmevent: function(drmEvent, drmData) {
                        log("Callback: ondrmevent - Event: " + drmEvent);
                    }
                };

                log("Setting AVPlay listener");
                root.webapis.avplay.setListener(avplayListener);

                log("Calling prepareAsync()");
                root.webapis.avplay.prepareAsync(function () {
                    var finalState = "UNKNOWN";
                    try { finalState = root.webapis.avplay.getState(); } catch(e) {}
                    log("prepareAsync success callback. State: " + finalState);
                    isPrepared = true;
                    
                    if (finalState === "READY" || finalState === "PAUSED") {
                        log("Calling play()");
                        try {
                            root.webapis.avplay.play();
                            log("play() completed successfully");
                        } catch (playError) {
                            log("play() threw exception: " + playError.message);
                            if (callbacks.onError) callbacks.onError("Failed to play: " + playError.message);
                        }
                    } else {
                        log("Unexpected state after prepare, not calling play().");
                    }
                }, function (prepareError) {
                    var msg = prepareError ? (prepareError.name + " (" + prepareError.message + ")") : "Unknown Error";
                    log("prepareAsync error callback: " + msg);
                    if (callbacks.onError) {
                        callbacks.onError("prepareAsync failed: " + msg);
                    }
                });

                // Fail-safe timeout if prepareAsync hangs indefinitely
                setTimeout(function() {
                    if (!isPrepared) {
                        log("prepareAsync timeout reached (15000ms)");
                        if (callbacks.onError) callbacks.onError("Player initialization timed out.");
                        try { stop(); } catch(e) {}
                    }
                }, 15000);

            } catch (error) {
                log("AVPlay setup exception: " + error.message);
                if (callbacks.onError) {
                    callbacks.onError(error.message);
                }
            }
        } else {
            // HTML5 Playback
            if (htmlPlayer) {
                try {
                    htmlPlayer.src = url;
                    htmlPlayer.load();
                    var startPlay = htmlPlayer.play();
                    if (startPlay !== undefined) {
                        startPlay.catch(function (error) {
                            log("HTML5 play failed: " + error.message);
                            if (callbacks.onError) {
                                callbacks.onError("Autoplay restricted or invalid stream link");
                            }
                        });
                    }
                } catch (error) {
                    log("HTML5 player exception: " + error.message);
                    if (callbacks.onError) {
                        callbacks.onError(error.message);
                    }
                }
            }
        }
    }

    function stop() {
        log("Stop requested");
        if (isTizen) {
            try {
                var state = root.webapis.avplay.getState();
                log("AVPlay current state: " + state);
                if (state === "PLAYING" || state === "PAUSED") {
                    root.webapis.avplay.stop();
                    log("AVPlay stop success");
                }
                state = root.webapis.avplay.getState();
                if (state !== "NONE" && state !== "IDLE") {
                    root.webapis.avplay.close();
                    log("AVPlay close success");
                }
            } catch (error) {
                log("AVPlay stop error: " + error.message);
            }
            isPrepared = false;
        } else {
            if (htmlPlayer) {
                try {
                    htmlPlayer.pause();
                    htmlPlayer.removeAttribute("src");
                    htmlPlayer.load();
                } catch (error) {
                    log("HTML5 stop error: " + error.message);
                }
            }
        }
        currentUrl = null;
    }

    function pause() {
        log("Pause requested");
        if (isTizen) {
            try {
                if (getDuration() <= 0) {
                    log("Ignoring pause request for live stream");
                    return;
                }
                if (root.webapis.avplay.getState() === "PLAYING") {
                    root.webapis.avplay.pause();
                }
            } catch (error) {
                log("AVPlay pause error: " + error.message);
            }
        } else {
            if (htmlPlayer) {
                htmlPlayer.pause();
            }
        }
    }

    function resume() {
        log("Resume requested");
        if (isTizen) {
            try {
                var state = root.webapis.avplay.getState();
                if (state === "PAUSED" || state === "READY") {
                    root.webapis.avplay.play();
                }
            } catch (error) {
                log("AVPlay resume error: " + error.message);
            }
        } else {
            if (htmlPlayer) {
                htmlPlayer.play();
            }
        }
    }

    function seek(ms) {
        log("Seek requested to: " + ms + "ms");
        if (isTizen) {
            try {
                if (getDuration() <= 0) {
                    log("Ignoring seek request for live stream");
                    return;
                }
                var state = root.webapis.avplay.getState();
                if (state === "PLAYING" || state === "PAUSED") {
                    if (ms > 0) {
                        root.webapis.avplay.jumpForward(ms);
                    } else if (ms < 0) {
                        root.webapis.avplay.jumpBackward(Math.abs(ms));
                    }
                }
            } catch (error) {
                log("AVPlay seek error: " + error.message);
            }
        } else {
            if (htmlPlayer) {
                htmlPlayer.currentTime = ms / 1000;
            }
        }
    }

    function getDuration() {
        if (isTizen) {
            try {
                return root.webapis.avplay.getDuration();
            } catch (error) {
                return -1;
            }
        } else {
            return htmlPlayer && htmlPlayer.duration ? htmlPlayer.duration * 1000 : -1;
        }
    }

    root.SportzXPlayer = {
        init: init,
        play: play,
        stop: stop,
        pause: pause,
        resume: resume,
        seek: seek,
        getDuration: getDuration
    };

}(this));
