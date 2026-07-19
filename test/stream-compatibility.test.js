"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");

function loadApi() {
    var context = {
        console: { log: function () {}, error: function () {} },
        Date: Date,
        Error: Error,
        JSON: JSON,
        Promise: Promise,
        XMLHttpRequest: function () {}
    };
    var code = fs.readFileSync(path.join(__dirname, "../js/api-client.js"), "utf8");
    vm.createContext(context);
    vm.runInContext(code, context, { filename: "api-client.js" });
    return context;
}

test("normalizes APK pipe headers and keeps the HTTPS URL", function () {
    var context = loadApi();
    var stream = context.SportzXApiUtils.normalizeStream({
        title: "Feed",
        link: "https://cdn.example/live.m3u8|User-Agent=Samsung+TV&Cookie=session%3Da%3Db",
        headers: { "user-agent": "overridden", Existing: "yes" }
    }, 0);

    assert.equal(stream.link, "https://cdn.example/live.m3u8");
    assert.deepEqual(JSON.parse(JSON.stringify(stream.headers)), {
        Existing: "yes",
        "User-Agent": "Samsung TV",
        Cookie: "session=a=b"
    });
    assert.equal(context.SportzXApiUtils.streamKind(stream), "HLS");
});

test("allows AVPlay-supported headers and rejects arbitrary request headers", function () {
    var context = loadApi();
    var utils = context.SportzXApiUtils;
    var supported = utils.normalizeStream({
        link: "https://cdn.example/live.m3u8|User-Agent=TV&Cookie=id%3D1",
        type: 0
    }, 0);
    var blocked = utils.normalizeStream({
        link: "https://cdn.example/live.m3u8|Referer=https%3A%2F%2Forigin.example%2F",
        type: 0
    }, 1);

    assert.equal(utils.streamSupport(supported).supported, true);
    assert.equal(utils.streamSupport(blocked).supported, false);
    assert.equal(utils.streamSupport(blocked).code, "CUSTOM_HEADERS_UNSUPPORTED");
});

test("rejects Android WebView and ClearKey feed types with precise codes", async function () {
    var context = loadApi();
    var api = new context.SportzXApi({ baseUrl: "https://api.example/" });
    var webView = context.SportzXApiUtils.normalizeStream({ link: "https://page.example/watch", type: 2 }, 0);
    var clearKey = context.SportzXApiUtils.normalizeStream({ link: "https://cdn.example/manifest.mpd", type: 1 }, 1);

    await assert.rejects(api.resolveStream(webView), function (error) {
        return error.code === "ANDROID_WEBVIEW_REQUIRED";
    });
    await assert.rejects(api.resolveStream(clearKey), function (error) {
        return error.code === "CLEARKEY_UNSUPPORTED";
    });
});

test("maps parsed User-Agent and Cookie into AVPlay options", function () {
    var context = loadApi();
    var api = new context.SportzXApi({ userAgent: "Default TV" });
    var stream = context.SportzXApiUtils.normalizeStream({
        title: "Feed 1",
        link: "https://cdn.example/live.m3u8|User-Agent=Feed+Agent&Cookie=token%3Dabc",
        type: 0
    }, 0);
    var options = api.playbackOptions(stream);

    assert.equal(options.userAgent, "Feed Agent");
    assert.equal(options.cookie, "token=abc");
    assert.deepEqual(JSON.parse(JSON.stringify(options.customHeaders)), {});
    assert.equal(options.title, "Feed 1");
});

test("identifies explicitly ended fixtures as expired", function () {
    var context = loadApi();
    var event = context.SportzXApiUtils.normalizeEvent({
        eventInfo: {
            startTime: "2026/07/17 12:00:00 +0000",
            endTime: "2026/07/17 14:00:00 +0000"
        }
    }, 0);

    assert.equal(context.SportzXApiUtils.isEventExpired(event, new Date("2026-07-17T13:00:00Z")), false);
    assert.equal(context.SportzXApiUtils.isEventExpired(event, new Date("2026-07-17T15:00:00Z")), true);
});

test("keeps expired API fixtures visible in All", function () {
    var context = loadApi();
    var now = new Date("2026-07-19T12:00:00Z");
    var event = context.SportzXApiUtils.normalizeEvent({
        cat: "Football",
        eventInfo: {
            startTime: "2026/07/17 12:00:00 +0000",
            endTime: "2026/07/17 14:00:00 +0000"
        }
    }, 0);
    var result = context.SportzXApiUtils.filterGuideEvents([event], "All", "All", now);

    assert.equal(result.events.length, 1);
    assert.equal(result.scheduleStale, true);
});

test("keeps status filters truthful when an entire sport schedule is stale", function () {
    var context = loadApi();
    var now = new Date("2026-07-19T12:00:00Z");
    var football = context.SportzXApiUtils.normalizeEvent({
        cat: "Football",
        eventInfo: {
            startTime: "2026/07/17 12:00:00 +0000",
            endTime: "2026/07/17 14:00:00 +0000"
        }
    }, 0);
    var result = context.SportzXApiUtils.filterGuideEvents([football], "Football", "Live", now);

    assert.equal(result.events.length, 0);
    assert.equal(result.scheduleStale, true);
});

test("does not label ordinary empty status filters as stale fallbacks", function () {
    var context = loadApi();
    var now = new Date("2026-07-19T12:00:00Z");
    var upcoming = context.SportzXApiUtils.normalizeEvent({
        cat: "Football",
        eventInfo: {
            startTime: "2026/07/20 12:00:00 +0000",
            endTime: "2026/07/20 14:00:00 +0000"
        }
    }, 0);
    var result = context.SportzXApiUtils.filterGuideEvents([upcoming], "Football", "Live", now);

    assert.equal(result.events.length, 0);
    assert.equal(result.scheduleStale, false);
});

test("removes literal null competition labels from the backend", function () {
    var context = loadApi();
    var event = context.SportzXApiUtils.normalizeEvent({
        eventInfo: { eventType: "null" }
    }, 0);

    assert.equal(event.eventInfo.eventType, "");
});
