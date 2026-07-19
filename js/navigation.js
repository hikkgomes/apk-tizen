(function (root) {
    "use strict";

    var KEY = {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        BACK: 10009,
        PLAY_PAUSE: 10252,
        REWIND: 412,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417
    };

    function visible(element) {
        var style;
        if (!element || !element.parentNode || element.disabled || element.getAttribute("aria-hidden") === "true") {
            return false;
        }
        style = root.getComputedStyle ? root.getComputedStyle(element) : null;
        return (!style || (style.display !== "none" && style.visibility !== "hidden")) &&
            (element.offsetWidth > 0 || element.offsetHeight > 0);
    }

    function center(rect) {
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    function scrollParent(element) {
        var node = element.parentNode;
        while (node && node !== document.body) {
            if (node.classList && (
                node.classList.contains("event-list") ||
                node.classList.contains("stream-list") ||
                node.classList.contains("filter-rail")
            )) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function reveal(element) {
        var parent = scrollParent(element);
        var er;
        var pr;
        if (!parent) {
            return;
        }
        er = element.getBoundingClientRect();
        pr = parent.getBoundingClientRect();
        if (er.top < pr.top + 8) {
            parent.scrollTop -= (pr.top + 8 - er.top);
        } else if (er.bottom > pr.bottom - 8) {
            parent.scrollTop += (er.bottom - pr.bottom + 8);
        }
        if (er.left < pr.left + 8) {
            parent.scrollLeft -= (pr.left + 8 - er.left);
        } else if (er.right > pr.right - 8) {
            parent.scrollLeft += (er.right - pr.right + 8);
        }
    }

    function FocusManager(options) {
        options = options || {};
        this.scope = options.scope || document;
        this.current = null;
        this.onBack = options.onBack || function () {};
        this.onMedia = options.onMedia || function () { return false; };
        this.onFocus = options.onFocus || function () {};
        this.keyHandler = this.handleKey.bind(this);
    }

    FocusManager.prototype.elements = function () {
        return Array.prototype.slice.call(this.scope.querySelectorAll(".focusable")).filter(visible);
    };

    FocusManager.prototype.focus = function (element) {
        if (!visible(element)) {
            return false;
        }
        if (this.current && this.current.classList) {
            this.current.classList.remove("is-focused");
        }
        this.current = element;
        element.classList.add("is-focused");
        try {
            element.focus();
        } catch (error) {
            // The CSS focus class remains the TV's source of truth.
        }
        reveal(element);
        this.onFocus(element);
        return true;
    };

    FocusManager.prototype.setScope = function (scope, preferred) {
        var elements;
        this.scope = scope || document;
        if (this.current && this.current.classList) {
            this.current.classList.remove("is-focused");
        }
        this.current = null;
        if (preferred && this.focus(preferred)) {
            return;
        }
        elements = this.elements();
        if (elements.length) {
            this.focus(elements[0]);
        }
    };

    FocusManager.prototype.refresh = function (preferred) {
        var elements;
        if (preferred && this.focus(preferred)) {
            return;
        }
        if (visible(this.current)) {
            this.focus(this.current);
            return;
        }
        elements = this.elements();
        if (elements.length) {
            this.focus(elements[0]);
        }
    };

    FocusManager.prototype.move = function (direction) {
        var candidates = this.elements();
        var current = this.current;
        var source;
        var best = null;
        var bestScore = Infinity;

        if (!current || !visible(current)) {
            return candidates.length ? this.focus(candidates[0]) : false;
        }

        candidates = this.navigationRegionCandidates(current, direction, candidates);

        source = center(current.getBoundingClientRect());
        candidates.forEach(function (candidate) {
            var target;
            var dx;
            var dy;
            var major;
            var minor;
            var score;
            if (candidate === current) {
                return;
            }
            target = center(candidate.getBoundingClientRect());
            dx = target.x - source.x;
            dy = target.y - source.y;

            if (direction === "left" && dx >= -3) { return; }
            if (direction === "right" && dx <= 3) { return; }
            if (direction === "up" && dy >= -3) { return; }
            if (direction === "down" && dy <= 3) { return; }

            if (direction === "left" || direction === "right") {
                major = Math.abs(dx);
                minor = Math.abs(dy);
            } else {
                major = Math.abs(dy);
                minor = Math.abs(dx);
            }
            score = major + minor * 2.8 + (minor > major * 1.8 ? 1000 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        });

        return best ? this.focus(best) : false;
    };

    FocusManager.prototype.navigationRegionCandidates = function (current, direction, candidates) {
        var currentCategory = current.closest && current.closest("#category-rail");
        var currentStatus = current.closest && current.closest("#status-rail");
        var currentEvents = current.closest && current.closest("#event-list");
        var selector = "";
        var preferred;

        if (direction === "down" && currentCategory) {
            selector = "#status-rail";
        } else if (direction === "down" && currentStatus) {
            selector = "#event-list";
        } else if (direction === "up" && currentEvents) {
            selector = "#status-rail";
        } else if (direction === "up" && currentStatus) {
            selector = "#category-rail";
        } else if ((direction === "left" || direction === "right") && currentCategory) {
            selector = "#category-rail";
        } else if ((direction === "left" || direction === "right") && currentStatus) {
            selector = "#status-rail";
        }

        if (!selector) {
            return candidates;
        }
        preferred = candidates.filter(function (candidate) {
            return candidate.closest && candidate.closest(selector);
        });
        return preferred.length ? preferred : candidates;
    };

    FocusManager.prototype.handleKey = function (event) {
        var code = event.keyCode || event.which;
        var active = document.activeElement;
        var handled = false;

        if (active && active.tagName === "INPUT" && (code === KEY.LEFT || code === KEY.RIGHT)) {
            return;
        }

        if (code === KEY.LEFT) {
            handled = this.move("left");
        } else if (code === KEY.UP) {
            handled = this.move("up");
        } else if (code === KEY.RIGHT) {
            handled = this.move("right");
        } else if (code === KEY.DOWN) {
            handled = this.move("down");
        } else if (code === KEY.ENTER) {
            if (this.current && visible(this.current)) {
                this.current.click();
                handled = true;
            }
        } else if (code === KEY.BACK) {
            this.onBack();
            handled = true;
        } else {
            handled = Boolean(this.onMedia(code));
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    FocusManager.prototype.start = function () {
        document.addEventListener("keydown", this.keyHandler, false);
    };

    FocusManager.prototype.stop = function () {
        document.removeEventListener("keydown", this.keyHandler, false);
    };

    function registerRemoteKeys() {
        var requested = [
            "MediaPlayPause",
            "MediaPlay",
            "MediaPause",
            "MediaStop",
            "MediaRewind",
            "MediaFastForward"
        ];
        var supported = {};
        var available = [];

        if (!root.tizen || !root.tizen.tvinputdevice) {
            return supported;
        }

        try {
            root.tizen.tvinputdevice.getSupportedKeys().forEach(function (key) {
                supported[key.name] = key.code;
            });
            requested.forEach(function (name) {
                if (own(supported, name)) {
                    available.push(name);
                }
            });
            if (available.length && root.tizen.tvinputdevice.registerKeyBatch) {
                root.tizen.tvinputdevice.registerKeyBatch(available);
            } else {
                available.forEach(function (name) {
                    root.tizen.tvinputdevice.registerKey(name);
                });
            }
        } catch (error) {
            // Navigation, Enter, and Back are mandatory and remain available.
        }
        return supported;
    }

    function selectFilterChip(rail, attribute, value) {
        var selected = null;
        if (!rail) {
            return selected;
        }
        Array.prototype.slice.call(rail.querySelectorAll(".filter-chip")).forEach(function (chip) {
            if (chip.getAttribute(attribute) === value) {
                chip.classList.add("is-active");
                selected = chip;
            } else {
                chip.classList.remove("is-active");
            }
        });
        return selected;
    }

    function own(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    root.SportzXNavigation = {
        FocusManager: FocusManager,
        KEY: KEY,
        registerRemoteKeys: registerRemoteKeys,
        selectFilterChip: selectFilterChip
    };
}(this));
