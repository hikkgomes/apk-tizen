(function (root) {
    "use strict";

    var apiClient = null;
    var fm = null;
    var allEvents = [];
    var allCategories = [];
    var activeCategory = "All";
    var activeStatus = "All";
    var lastFocusedMainElement = null;
    var activeDialog = null; // 'stream', 'settings', 'exit', 'player'
    var selectedEvent = null;
    var selectedStream = null;
    var activeStreams = [];
    var playerControlTimer = null;
    var clockTimer = null;

    // DOM cache
    var loadingState = null;
    var errorState = null;
    var errorMessage = null;
    var emptyState = null;
    var eventList = null;
    var eventPreview = null;
    var categoryRail = null;
    var statusRail = null;
    var eventCount = null;
    var connectionState = null;
    var localClock = null;

    var streamDialog = null;
    var streamTitle = null;
    var streamSubtitle = null;
    var streamLoading = null;
    var streamError = null;
    var streamList = null;

    var settingsDialog = null;
    var apiInput = null;
    var settingsStatus = null;

    var exitDialog = null;

    var playerLayer = null;
    var playerLoading = null;
    var playerError = null;
    var playerErrorMessage = null;
    var playerControls = null;
    var playerEvent = null;
    var playerFeed = null;
    var playPauseButton = null;
    var progressFill = null;
    var timeLabel = null;

    function init() {
        console.log("[SportzXApp] Initialising TV Guide application");

        // Cache elements
        loadingState = document.getElementById("loading-state");
        errorState = document.getElementById("error-state");
        errorMessage = document.getElementById("error-message");
        emptyState = document.getElementById("empty-state");
        eventList = document.getElementById("event-list");
        eventPreview = document.getElementById("event-preview");
        categoryRail = document.getElementById("category-rail");
        statusRail = document.getElementById("status-rail");
        eventCount = document.getElementById("event-count");
        connectionState = document.getElementById("connection-state");
        localClock = document.getElementById("local-clock");

        streamDialog = document.getElementById("stream-dialog");
        streamTitle = document.getElementById("stream-title");
        streamSubtitle = document.getElementById("stream-subtitle");
        streamLoading = document.getElementById("stream-loading");
        streamError = document.getElementById("stream-error");
        streamList = document.getElementById("stream-list");

        settingsDialog = document.getElementById("settings-dialog");
        apiInput = document.getElementById("api-input");
        settingsStatus = document.getElementById("settings-status");

        exitDialog = document.getElementById("exit-dialog");

        playerLayer = document.getElementById("player-layer");
        playerLoading = document.getElementById("player-loading");
        playerError = document.getElementById("player-error");
        playerErrorMessage = document.getElementById("player-error-message");
        playerControls = document.getElementById("player-controls");
        playerEvent = document.getElementById("player-event");
        playerFeed = document.getElementById("player-feed");
        playPauseButton = document.getElementById("play-pause-button");
        progressFill = document.getElementById("progress-fill");
        timeLabel = document.getElementById("time-label");

        // Initialize clock
        startClock();

        // Setup Focus Navigation
        fm = new SportzXNavigation.FocusManager({
            scope: document,
            onBack: handleBackKey,
            onMedia: handleMediaKey,
            onFocus: handleFocusChange
        });
        fm.start();

        // Register Tizen TV keys
        SportzXNavigation.registerRemoteKeys();

        // Initialize player
        SportzXPlayer.init({
            onBufferingStart: function () {
                if (playerLoading) playerLoading.classList.remove("is-hidden");
            },
            onBufferingComplete: function () {
                if (playerLoading) playerLoading.classList.add("is-hidden");
            },
            onCurrentPlayTime: function (currentTimeMs, durationMs) {
                updatePlaybackProgress(currentTimeMs, durationMs);
            },
            onCompleted: function () {
                closePlayer();
                showToast("Stream playback ended");
            },
            onError: function (msg) {
                showPlayerError(msg);
            }
        });

        // Set action listeners
        setupActions();

        // Run config discovery
        loadConfigAndGuide();
    }

    function startClock() {
        function updateClock() {
            var now = new Date();
            var hours = String(now.getHours()).padStart(2, "0");
            var minutes = String(now.getMinutes()).padStart(2, "0");
            var seconds = String(now.getSeconds()).padStart(2, "0");
            if (localClock) {
                localClock.textContent = hours + ":" + minutes + ":" + seconds;
            }
        }
        updateClock();
        clockTimer = setInterval(updateClock, 1000);
    }

    function loadConfigAndGuide() {
        showLoading(true);
        setConnectionState("Connecting", "is-online", false);

        var config = SportzXRemoteConfig.configured();
        if (config) {
            console.log("[SportzXApp] Using configured endpoint: " + config.apiBase);
            initializeApi(config);
        } else {
            console.log("[SportzXApp] Endpoint not configured, running discovery");
            SportzXRemoteConfig.discover().then(function (discovered) {
                console.log("[SportzXApp] Discovery successful: " + discovered.apiBase);
                initializeApi(discovered);
            }).catch(function (error) {
                console.error("[SportzXApp] Discovery failed", error);
                showMainError("Could not configure the TV connection: " + error.message);
                setConnectionState("Disconnected", "is-error", true);
            });
        }
    }

    function initializeApi(config) {
        apiClient = new SportzXApi({
            baseUrl: config.apiBase,
            userAgent: config.userAgent
        });

        setConnectionState("Connected", "is-online", true);
        fetchGuide();
    }

    function setConnectionState(text, cls, isState) {
        if (!connectionState) return;
        connectionState.className = "connection-state " + cls;
        var label = connectionState.querySelector("span:not(.connection-dot)");
        if (label) {
            label.textContent = text;
        }
    }

    function fetchGuide() {
        showLoading(true);
        apiClient.getGuide().then(function (guide) {
            allEvents = guide.events;

            // Generate category list from events & categories
            var cats = {};
            guide.categories.forEach(function (c) {
                cats[c.title] = true;
            });
            allEvents.forEach(function (e) {
                if (e.cat) {
                    cats[e.cat] = true;
                }
            });
            allCategories = ["All"].concat(Object.keys(cats).sort());

            renderCategoryRail();
            renderStatusRail();
            renderEvents();

            showLoading(false);

            // Focus first active rail item or event row
            setTimeout(function () {
                var firstEvent = eventList.querySelector(".event-row");
                if (firstEvent) {
                    fm.setScope(document, firstEvent);
                } else {
                    fm.setScope(document);
                }
            }, 100);

        }).catch(function (error) {
            console.error("[SportzXApp] Error loading guide", error);
            showMainError("Fixtures are currently unavailable. Check settings or network.");
        });
    }

    function showLoading(show) {
        if (show) {
            loadingState.classList.remove("is-hidden");
            errorState.classList.add("is-hidden");
            emptyState.classList.add("is-hidden");
            eventList.classList.add("is-hidden");
        } else {
            loadingState.classList.add("is-hidden");
            eventList.classList.remove("is-hidden");
        }
    }

    function showMainError(msg) {
        loadingState.classList.add("is-hidden");
        errorState.classList.remove("is-hidden");
        emptyState.classList.add("is-hidden");
        eventList.classList.add("is-hidden");
        if (errorMessage) {
            errorMessage.textContent = msg;
        }
        setTimeout(function () {
            fm.setScope(errorState, errorState.querySelector("button"));
        }, 50);
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str).replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    function escapeAttr(str) {
        return escapeHTML(str);
    }

    function renderCategoryRail() {
        if (!categoryRail) return;
        var html = "";
        allCategories.forEach(function (cat) {
            var activeClass = cat === activeCategory ? " is-active" : "";
            html += '<button type="button" class="filter-chip focusable' + activeClass + '" tabindex="-1" data-filter-cat="' + escapeAttr(cat) + '">' +
                    escapeHTML(cat) +
                    '</button>';
        });
        categoryRail.innerHTML = html;
    }

    function renderStatusRail() {
        if (!statusRail) return;
        var statuses = ["All", "Live", "Today", "Upcoming"];
        var html = "";
        statuses.forEach(function (status) {
            var activeClass = status === activeStatus ? " is-active" : "";
            html += '<button type="button" class="filter-chip focusable' + activeClass + '" tabindex="-1" data-filter-status="' + status + '">' +
                    status +
                    '</button>';
        });
        statusRail.innerHTML = html;
    }

    function isEventLive(event) {
        if (event.eventInfo.eventType && event.eventInfo.eventType.toLowerCase().indexOf("live") !== -1) {
            return true;
        }
        var start = SportzXApiUtils.parseEventTime(event.eventInfo.startTime);
        var end = SportzXApiUtils.parseEventTime(event.eventInfo.endTime);
        var now = new Date();

        if (start) {
            if (!end) {
                // Fallback: assume live for 2 hours if start has passed
                return now >= start && now.getTime() <= (start.getTime() + 2 * 60 * 60 * 1000);
            }
            return now >= start && now <= end;
        }
        return false;
    }

    function isEventToday(event) {
        var start = SportzXApiUtils.parseEventTime(event.eventInfo.startTime);
        if (!start) return false;
        var today = new Date();
        return start.getFullYear() === today.getFullYear() &&
               start.getMonth() === today.getMonth() &&
               start.getDate() === today.getDate();
    }

    function isEventUpcoming(event) {
        var start = SportzXApiUtils.parseEventTime(event.eventInfo.startTime);
        if (!start) return false;
        var now = new Date();
        return start > now;
    }

    function renderEvents() {
        var filtered = allEvents.filter(function (event) {
            // Category check
            if (activeCategory !== "All" && event.cat !== activeCategory) {
                return false;
            }
            // Status check
            if (activeStatus === "Live") {
                return isEventLive(event);
            } else if (activeStatus === "Today") {
                return isEventToday(event) || isEventLive(event);
            } else if (activeStatus === "Upcoming") {
                return isEventUpcoming(event) && !isEventLive(event);
            }
            return true;
        });

        if (eventCount) {
            eventCount.textContent = filtered.length + " fixtures";
        }

        if (filtered.length === 0) {
            emptyState.classList.remove("is-hidden");
            eventList.classList.add("is-hidden");
            eventPreview.innerHTML = '<div class="preview-empty"><span class="preview-orbit"></span><p>No fixtures found matching this filter.</p></div>';
            return;
        }

        emptyState.classList.add("is-hidden");
        eventList.classList.remove("is-hidden");

        var html = "";
        filtered.forEach(function (event) {
            var timeHtml = "";
            var isLive = isEventLive(event);

            if (isLive) {
                timeHtml = '<span class="live-label">LIVE</span>';
            } else {
                var start = SportzXApiUtils.parseEventTime(event.eventInfo.startTime);
                if (start) {
                    var hours = String(start.getHours()).padStart(2, "0");
                    var minutes = String(start.getMinutes()).padStart(2, "0");
                    var days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
                    timeHtml = '<strong>' + hours + ':' + minutes + '</strong><span>' + days[start.getDay()] + ' ' + start.getDate() + '/' + (start.getMonth() + 1) + '</span>';
                } else {
                    timeHtml = '<strong>--:--</strong><span>UPCOMING</span>';
                }
            }

            var feedCount = event.formats.length + event.formatsNew.length;

            var baseClass = "event-row focusable";
            if (isLive) {
                baseClass += " is-live";
            }

            html += '<div role="button" class="' + baseClass + '" tabindex="-1" data-event-id="' + escapeAttr(event.id) + '">';

            html += '  <div class="event-time">' + timeHtml + '</div>' +
                    '  <div class="event-copy">' +
                    '    <div class="event-meta">' +
                    '      <span>' + escapeHTML(event.cat) + '</span>' +
                    (event.eventInfo.eventType ? '      <span class="dot"></span><span>' + escapeHTML(event.eventInfo.eventType) + '</span>' : '') +
                    '    </div>' +
                    '    <span class="event-name">' + escapeHTML(event.eventInfo.eventName) + '</span>' +
                    '  </div>' +
                    '  <div class="event-availability">' + feedCount + ' Feeds</div>' +
                    '</div>';
        });

        eventList.innerHTML = html;
    }

    function formatTime(timeStr) {
        var d = SportzXApiUtils.parseEventTime(timeStr);
        if (!d) return timeStr || "Unknown";
        var hours = String(d.getHours()).padStart(2, "0");
        var minutes = String(d.getMinutes()).padStart(2, "0");
        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return hours + ":" + minutes + " - " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    }

    function updatePreview(event) {
        if (!event) {
            eventPreview.innerHTML = '<div class="preview-empty"><span class="preview-orbit"></span><p>Select a fixture to see its broadcast details.</p></div>';
            return;
        }

        var isLive = isEventLive(event);
        var feedCount = event.formats.length + event.formatsNew.length;

        var html = '<div class="preview-content">' +
                   '  <div class="preview-top">' +
                   '    <span class="preview-category">' + escapeHTML(event.cat) + '</span>' +
                   (event.eventInfo.isHot ? '    <span class="hot-chip">HOT</span>' : '') +
                   (isLive ? '    <span class="live-chip">LIVE</span>' : '') +
                   '  </div>' +
                   '  <h2>' + escapeHTML(event.eventInfo.eventName) + '</h2>' +
                   '  <p class="preview-competition">' + escapeHTML(event.eventInfo.eventType || "") + '</p>' +
                   '  <div class="versus">' +
                   '    <div class="team">' +
                   '      <div class="team-flag">' +
                   (event.eventInfo.teamAFlag ? '        <img src="' + escapeAttr(event.eventInfo.teamAFlag) + '" alt="">' : escapeHTML(event.eventInfo.teamA ? event.eventInfo.teamA.charAt(0) : "?")) +
                   '      </div>' +
                   '      <span class="team-name">' + escapeHTML(event.eventInfo.teamA || "Team A") + '</span>' +
                   '    </div>' +
                   '    <div class="versus-mark">VS</div>' +
                   '    <div class="team">' +
                   '      <div class="team-flag">' +
                   (event.eventInfo.teamBFlag ? '        <img src="' + escapeAttr(event.eventInfo.teamBFlag) + '" alt="">' : escapeHTML(event.eventInfo.teamB ? event.eventInfo.teamB.charAt(0) : "?")) +
                   '      </div>' +
                   '      <span class="team-name">' + escapeHTML(event.eventInfo.teamB || "Team B") + '</span>' +
                   '    </div>' +
                   '  </div>' +
                   '  <div class="preview-schedule">' +
                   '    <span>Scheduled Start</span>' +
                   '    <strong>' + escapeHTML(formatTime(event.eventInfo.startTime)) + '</strong>' +
                   '  </div>' +
                   '  <div class="preview-action">' +
                   '    <span>Press <kbd>OK</kbd> to watch</span>' +
                   '    <span>' + feedCount + ' feeds available</span>' +
                   '  </div>' +
                   '</div>';

        eventPreview.innerHTML = html;
    }

    function setupActions() {
        document.addEventListener("click", function (e) {
            var target = e.target;

            // Handle actions using data attributes
            var actionBtn = target.closest("[data-action]");
            if (actionBtn) {
                var action = actionBtn.getAttribute("data-action");
                handleButtonAction(action, actionBtn);
                return;
            }

            // Handle event row clicks
            var eventRow = target.closest(".event-row");
            if (eventRow) {
                var id = eventRow.getAttribute("data-event-id");
                var eventObj = allEvents.find(function (e) { return e.id === id; });
                if (eventObj) {
                    openStreamDialog(eventObj);
                }
                return;
            }

            // Handle stream item clicks
            var streamRow = target.closest(".stream-option");
            if (streamRow) {
                var index = parseInt(streamRow.getAttribute("data-stream-index"), 10);
                if (activeStreams && activeStreams.length > index) {
                    var streamObj = activeStreams[index];
                    if (streamObj) {
                        playStream(streamObj);
                    }
                }
                return;
            }

            // Handle filter rail clicks
            var filterCat = target.getAttribute("data-filter-cat");
            if (filterCat) {
                activeCategory = filterCat;
                renderCategoryRail();
                renderEvents();
                return;
            }

            var filterStatus = target.getAttribute("data-filter-status");
            if (filterStatus) {
                activeStatus = filterStatus;
                renderStatusRail();
                renderEvents();
                return;
            }
        });
    }

    function handleButtonAction(action, btn) {
        switch (action) {
            case "refresh":
                loadConfigAndGuide();
                showToast("Refreshing Guide...");
                break;
            case "settings":
                openSettingsDialog();
                break;
            case "discover":
                discoverApiUrl();
                break;
            case "save-settings":
                saveApiUrl();
                break;
            case "retry":
                loadConfigAndGuide();
                break;
            case "cancel-exit":
                closeExitDialog();
                break;
            case "confirm-exit":
                exitGuide();
                break;
            case "close-player":
                closePlayer();
                break;
            case "toggle-play":
                togglePlayback();
                break;
        }
    }

    function handleFocusChange(element) {
        if (!element) return;

        // If focusing event list rows, save current row and update preview
        if (element.classList.contains("event-row")) {
            lastFocusedMainElement = element;
            var id = element.getAttribute("data-event-id");
            var eventObj = allEvents.find(function (e) { return e.id === id; });
            if (eventObj) {
                updatePreview(eventObj);
            }
        } else if (element.closest(".topbar-actions") || element.closest(".filter-rail")) {
            lastFocusedMainElement = element;
        }
    }

    // --- Stream Dialog ---
    function openStreamDialog(eventObj) {
        console.log("[SportzXApp] Opening stream dialog");
        selectedEvent = eventObj;
        activeDialog = "stream";
        streamDialog.classList.remove("is-hidden");
        console.log("stream dialog classes", streamDialog.className);
        console.log("stream dialog rect", JSON.stringify(streamDialog.getBoundingClientRect()));
        console.log("viewport", window.innerWidth, window.innerHeight);

        streamTitle.textContent = eventObj.eventInfo.eventName;
        streamSubtitle.textContent = eventObj.cat + " • " + (eventObj.eventInfo.eventType || "Guide Feed");

        streamLoading.classList.remove("is-hidden");
        streamError.classList.add("is-hidden");
        streamList.classList.add("is-hidden");
        streamList.innerHTML = "";

        fm.setScope(streamDialog);

        apiClient.getStreams(eventObj).then(function (streams) {
            console.log("[SportzXApp] Number of streams loaded: " + streams.length);
            activeStreams = streams;
            streamLoading.classList.add("is-hidden");
            if (streams.length === 0) {
                streamError.classList.remove("is-hidden");
                streamError.textContent = "No broadcast links available for this match.";
                return;
            }

            streamList.classList.remove("is-hidden");
            var html = "";
            streams.forEach(function (stream, index) {
                var kind = SportzXApiUtils.streamKind(stream);
                html += '<div role="button" class="stream-option focusable" tabindex="-1" data-stream-index="' + index + '">' +
                        '  <div class="stream-index">' + (index + 1) + '</div>' +
                        '  <div class="stream-copy">' +
                        '    <strong>' + escapeHTML(stream.title) + '</strong>' +
                        '    <small>' + escapeHTML(stream.type || kind) + '</small>' +
                        '  </div>' +
                        '  <div class="format-tag">' + escapeHTML(kind) + '</div>' +
                        '</div>';
            });
            streamList.innerHTML = html;

            // Focus first stream item
            setTimeout(function () {
                var firstStream = streamList.querySelector(".stream-option");
                if (firstStream) {
                    fm.setScope(streamDialog, firstStream);
                }
            }, 50);

        }).catch(function (error) {
            console.error("[SportzXApp] Error loading streams", error);
            streamLoading.classList.add("is-hidden");
            streamError.classList.remove("is-hidden");
            streamError.textContent = "Could not reach the stream resolver API.";
        });
    }

    function closeStreamDialog() {
        console.log("[SportzXApp] closing stream dialog");
        streamDialog.classList.add("is-hidden");
        activeDialog = null;
        selectedEvent = null;
        activeStreams = [];
        if (lastFocusedMainElement) {
            fm.setScope(document, lastFocusedMainElement);
        } else {
            fm.setScope(document);
        }
    }

    // --- Settings Dialog ---
    function openSettingsDialog() {
        activeDialog = "settings";
        settingsDialog.classList.remove("is-hidden");
        settingsStatus.textContent = "";

        var currentBase = apiClient ? apiClient.baseUrl : "";
        if (!currentBase) {
            var saved = SportzXRemoteConfig.configured();
            currentBase = saved ? saved.apiBase : "";
        }
        apiInput.value = currentBase;

        fm.setScope(settingsDialog, apiInput);
    }

    function closeSettingsDialog() {
        settingsDialog.classList.add("is-hidden");
        activeDialog = null;
        if (lastFocusedMainElement) {
            fm.setScope(document, lastFocusedMainElement);
        } else {
            fm.setScope(document);
        }
    }

    function discoverApiUrl() {
        settingsStatus.textContent = "Discovering endpoint...";
        settingsStatus.style.color = "var(--amber)";

        SportzXRemoteConfig.discover().then(function (result) {
            apiInput.value = result.apiBase;
            settingsStatus.textContent = "Successfully discovered endpoint!";
            settingsStatus.style.color = "var(--green)";
        }).catch(function (error) {
            settingsStatus.textContent = "Discovery failed: " + error.message;
            settingsStatus.style.color = "var(--red)";
        });
    }

    function saveApiUrl() {
        var val = apiInput.value;
        try {
            SportzXRemoteConfig.saveOverride(val, "Mozilla/5.0 (SmartTV; SmartTV) AppleWebKit/537.42 Tizen/3.0");
            settingsStatus.textContent = "Settings saved! Reloading application...";
            settingsStatus.style.color = "var(--green)";
            setTimeout(function () {
                root.location.reload();
            }, 1000);
        } catch (error) {
            settingsStatus.textContent = error.message;
            settingsStatus.style.color = "var(--red)";
        }
    }

    // --- Exit Dialog ---
    function openExitDialog() {
        activeDialog = "exit";
        exitDialog.classList.remove("is-hidden");
        var cancelBtn = exitDialog.querySelector('[data-action="cancel-exit"]');
        fm.setScope(exitDialog, cancelBtn);
    }

    function closeExitDialog() {
        exitDialog.classList.add("is-hidden");
        activeDialog = null;
        if (lastFocusedMainElement) {
            fm.setScope(document, lastFocusedMainElement);
        } else {
            fm.setScope(document);
        }
    }

    function exitGuide() {
        console.log("[SportzXApp] Exiting application");
        if (root.tizen && root.tizen.application) {
            try {
                root.tizen.application.getCurrentApplication().exit();
            } catch (e) {
                window.close();
            }
        } else {
            window.close();
        }
    }

    // --- Player Management ---
    function playStream(stream) {
        var kind = stream.type || (window.SportzXApiUtils ? SportzXApiUtils.streamKind(stream) : "");
        console.log("[SportzXApp] Selected stream type: " + kind);
        
        var streamRow = document.activeElement ? document.activeElement.closest('.stream-option') : null;
        if (streamRow) {
            console.log("[SportzXApp] Focused stream index: " + streamRow.getAttribute("data-stream-index"));
        }

        console.log("[SportzXApp] Opening player layer");
        selectedStream = stream;
        activeDialog = "player";

        playerLayer.classList.remove("is-hidden");
        playerLoading.classList.remove("is-hidden");
        playerError.classList.add("is-hidden");
        playerLayer.classList.add("controls-visible");
        
        console.log("player layer classes", playerLayer.className);
        console.log("player layer rect", JSON.stringify(playerLayer.getBoundingClientRect()));

        playerEvent.textContent = selectedEvent ? selectedEvent.eventInfo.eventName : "SportzX Broadcast";
        playerFeed.textContent = stream.title;

        playPauseButton.textContent = "Ⅱ";

        showToast("Resolving stream feed...");

        // Resolve stream link first
        console.log("[SportzXApp] Start of stream resolution");
        apiClient.resolveStream(stream).then(function (resolved) {
            console.log("[SportzXApp] End of stream resolution");
            try {
                var host = new URL(resolved.link).hostname;
                var mediaType = resolved.link.split('?')[0].split('.').pop() || "unknown";
                console.log("[SportzXApp] Stream hostname: " + host + ", media type: " + mediaType);
            } catch (e) {
                console.log("[SportzXApp] Could not parse hostname");
            }
            showToast("Connecting to live match...");
            var playOpts = apiClient.playbackOptions(resolved);
            SportzXPlayer.play(resolved.link, playOpts);
            fm.setScope(playerLayer, playPauseButton);
            showPlayerControlsTemporarily();
        }).catch(function (error) {
            console.error("[SportzXApp] Failed to resolve stream link", error);
            showPlayerError(error.message || "Failed to resolve stream link.");
        });
    }

    function showPlayerError(msg) {
        playerLoading.classList.add("is-hidden");
        playerError.classList.remove("is-hidden");
        playerErrorMessage.textContent = msg;
        var backBtn = playerError.querySelector("button");
        fm.setScope(playerLayer, backBtn);
    }

    function togglePlayback() {
        if (!selectedStream) return;

        if (playPauseButton.textContent === "Ⅱ") {
            SportzXPlayer.pause();
            playPauseButton.textContent = "▶";
            showToast("Paused");
        } else {
            SportzXPlayer.resume();
            playPauseButton.textContent = "Ⅱ";
            showToast("Resuming...");
        }
        showPlayerControlsTemporarily();
    }

    function updatePlaybackProgress(currentTimeMs, durationMs) {
        if (!progressFill) return;

        if (durationMs <= 0) {
            // Live Stream
            progressFill.style.width = "100%";
            if (timeLabel) timeLabel.textContent = "LIVE";
        } else {
            var pct = (currentTimeMs / durationMs) * 100;
            progressFill.style.width = pct + "%";

            // Format time
            var curSec = Math.floor(currentTimeMs / 1000);
            var durSec = Math.floor(durationMs / 1000);

            var curMin = Math.floor(curSec / 60);
            var curRemainSec = curSec % 60;
            var durMin = Math.floor(durSec / 60);
            var durRemainSec = durSec % 60;

            var timeText = String(curMin).padStart(2, "0") + ":" + String(curRemainSec).padStart(2, "0") + " / " +
                           String(durMin).padStart(2, "0") + ":" + String(durRemainSec).padStart(2, "0");

            if (timeLabel) timeLabel.textContent = timeText;
        }
    }

    function showPlayerControlsTemporarily() {
        if (!playerControls) return;
        playerLayer.classList.add("controls-visible");

        if (playerControlTimer) {
            clearTimeout(playerControlTimer);
        }

        playerControlTimer = setTimeout(function () {
            if (activeDialog === "player" && !playerError.classList.contains("is-hidden")) {
                // Keep controls visible if error is showing
                return;
            }
            playerLayer.classList.remove("controls-visible");
        }, 5000); // Hide controls after 5 seconds
    }

    function closePlayer() {
        console.log("[SportzXApp] closing player");
        SportzXPlayer.stop();
        if (playerControlTimer) clearTimeout(playerControlTimer);
        playerLayer.classList.add("is-hidden");
        activeDialog = "stream";
        selectedStream = null;

        // Restore focus to stream list
        fm.setScope(streamDialog, streamList.querySelector(".stream-option"));
    }

    // --- Key Events ---
    function handleBackKey() {
        console.log("[SportzXApp] BACK key pressed. Active State: " + activeDialog);

        if (activeDialog === "player") {
            closePlayer();
        } else if (activeDialog === "stream") {
            closeStreamDialog();
        } else if (activeDialog === "settings") {
            closeSettingsDialog();
        } else if (activeDialog === "exit") {
            closeExitDialog();
        } else {
            // From main screen, open exit confirm modal
            openExitDialog();
        }
    }

    function handleMediaKey(code) {
        var KEY = SportzXNavigation.KEY;
        if (activeDialog !== "player") return false;

        switch (code) {
            case KEY.PLAY_PAUSE:
                togglePlayback();
                return true;
            case KEY.PLAY:
                if (playPauseButton.textContent === "▶") {
                    togglePlayback();
                }
                return true;
            case KEY.PAUSE:
                if (playPauseButton.textContent === "Ⅱ") {
                    togglePlayback();
                }
                return true;
            case KEY.STOP:
                closePlayer();
                return true;
            case KEY.REWIND:
                SportzXPlayer.seek(-10000); // 10s back
                showToast("Rewind 10s");
                showPlayerControlsTemporarily();
                return true;
            case KEY.FAST_FORWARD:
                SportzXPlayer.seek(10000); // 10s forward
                showToast("Forward 10s");
                showPlayerControlsTemporarily();
                return true;
        }
        return false;
    }

    // --- Helper Utils ---
    function showToast(message) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove("is-hidden");
        toast.style.opacity = "1";

        setTimeout(function () {
            toast.style.opacity = "0";
            setTimeout(function () {
                toast.classList.add("is-hidden");
            }, 300);
        }, 2500);
    }

    // Run on document loaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

}(this));
