"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");

function makeElement() {
    return {
        classList: { add: function () {}, remove: function () {} },
        addEventListener: function () {},
        removeAttribute: function () {},
        load: function () {},
        play: function () { return Promise.resolve(); },
        pause: function () {}
    };
}

function loadPlayer() {
    var opened = [];
    var properties = [];
    var state = "IDLE";
    var listener = null;
    var elements = { "av-player": makeElement(), "html-player": makeElement() };
    var avplay = {
        getState: function () { return state; },
        open: function (url) { opened.push(url); state = "IDLE"; },
        close: function () { state = "IDLE"; },
        stop: function () { state = "IDLE"; },
        play: function () { state = "PLAYING"; },
        setDisplayRect: function () {},
        setDisplayMethod: function () {},
        setStreamingProperty: function (name, value) { properties.push([name, value]); },
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) {
            setTimeout(function () { state = "READY"; success(); }, 0);
        },
        getDuration: function () { return -1; }
    };
    var context = {
        console: { log: function () {} },
        document: { getElementById: function (id) { return elements[id]; } },
        webapis: { avplay: avplay },
        URL: URL,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        innerWidth: 1920,
        innerHeight: 1080
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/avplay-player.js"), "utf8"), context, { filename: "avplay-player.js" });
    return { context: context, opened: opened, properties: properties, listener: function () { return listener; } };
}

test("opens the original HTTPS stream and applies documented properties", async function () {
    var loaded = loadPlayer();
    var errors = [];
    loaded.context.SportzXPlayer.init({ onError: function (message) { errors.push(message); } });
    loaded.context.SportzXPlayer.play("https://cdn.example/live.m3u8?token=secret", {
        userAgent: "Samsung TV",
        cookie: "session=abc"
    });
    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.deepEqual(loaded.opened, ["https://cdn.example/live.m3u8?token=secret"]);
    assert.deepEqual(loaded.properties, [["USER_AGENT", "Samsung TV"], ["COOKIE", "session=abc"]]);
    assert.deepEqual(errors, []);
});

test("rejects unsupported custom headers before opening AVPlay", function () {
    var loaded = loadPlayer();
    var errors = [];
    loaded.context.SportzXPlayer.init({ onError: function (message) { errors.push(message); } });
    loaded.context.SportzXPlayer.play("https://cdn.example/live.m3u8", {
        customHeaders: { Referer: "https://origin.example/" }
    });

    assert.deepEqual(loaded.opened, []);
    assert.match(errors[0], /request headers/);
});

test("turns AVPlay connection errors into actionable messages", function () {
    var loaded = loadPlayer();
    var errors = [];
    loaded.context.SportzXPlayer.init({ onError: function (message) { errors.push(message); } });
    loaded.context.SportzXPlayer.play("https://cdn.example/live.m3u8", {});
    loaded.listener().onerror("PLAYER_ERROR_CONNECTION_FAILED");

    assert.equal(errors[0], "The stream server could not be reached.");
    loaded.context.SportzXPlayer.stop();
});
