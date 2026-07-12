(function (root) {
    "use strict";

    var playerElement = null;
    var htmlPlayer = null;
    var isTizen = false;
    var currentUrl = null;
    var callbacks = {};
    var isPrepared = false;
    var isBufferComplete = true;

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
        log("Play requested for URL: " + url);
        currentUrl = url;
        isPrepared = false;
        options = options || {};

        if (isTizen) {
            try {
                // Ensure any previous playback is completely stopped
                stop();

                root.webapis.avplay.open(url);
                log("AVPlay open success");

                // Set full screen layout
                root.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
                root.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");

                // Apply custom user-agent and cookie properties if provided
                if (options.userAgent) {
                    log("Setting custom USER_AGENT: " + options.userAgent);
                    root.webapis.avplay.setStreamingProperty("USER_AGENT", options.userAgent);
                }
                if (options.cookie) {
                    log("Setting custom COOKIE: " + options.cookie);
                    root.webapis.avplay.setStreamingProperty("COOKIE", options.cookie);
                }

                var avplayListener = {
                    onbufferingstart: function () {
                        log("AVPlay: Buffering started");
                        isBufferComplete = false;
                        if (callbacks.onBufferingStart) {
                            callbacks.onBufferingStart();
                        }
                    },
                    onbufferingprogress: function (percent) {
                        log("AVPlay: Buffering progress: " + percent + "%");
                    },
                    onbufferingcomplete: function () {
                        log("AVPlay: Buffering complete");
                        isBufferComplete = true;
                        if (callbacks.onBufferingComplete) {
                            callbacks.onBufferingComplete();
                        }
                    },
                    oncurrentplaytime: function (currentTimeMs) {
                        if (callbacks.onCurrentPlayTime) {
                            var durationMs = -1;
                            try {
                                durationMs = root.webapis.avplay.getDuration();
                            } catch (e) {
                                // Ignore if duration is unavailable (e.g. live stream)
                            }
                            callbacks.onCurrentPlayTime(currentTimeMs, durationMs);
                        }
                    },
                    onstreamcompleted: function () {
                        log("AVPlay: Stream completed");
                        if (callbacks.onCompleted) {
                            callbacks.onCompleted();
                        }
                    },
                    onerror: function (eventType) {
                        log("AVPlay Error: " + eventType);
                        var errMsg = "AVPlay error (" + eventType + ")";
                        if (callbacks.onError) {
                            callbacks.onError(errMsg);
                        }
                    },
                    onevent: function (eventType, eventData) {
                        log("AVPlay Event: " + eventType + " Data: " + eventData);
                    }
                };

                root.webapis.avplay.setListener(avplayListener);

                root.webapis.avplay.prepareAsync(function () {
                    log("AVPlay prepare success, starting playback");
                    isPrepared = true;
                    try {
                        root.webapis.avplay.play();
                    } catch (playError) {
                        log("AVPlay play failed: " + playError.message);
                        if (callbacks.onError) {
                            callbacks.onError("Failed to start playback after preparing: " + playError.message);
                        }
                    }
                }, function (prepareError) {
                    log("AVPlay prepare failed: " + prepareError.name + " (" + prepareError.message + ")");
                    if (callbacks.onError) {
                        callbacks.onError("Could not prepare the video stream");
                    }
                });

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
                if (state !== "NONE" && state !== "IDLE") {
                    root.webapis.avplay.stop();
                    log("AVPlay stop success");
                }
                root.webapis.avplay.close();
                log("AVPlay close success");
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
                root.webapis.avplay.jumpForward(ms);
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
