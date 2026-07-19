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
    assert.equal(result.scheduleStale, false);
});

test("keeps status filters truthful without inventing schedule errors", function () {
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
    assert.equal(result.scheduleStale, false);
});

test("normalizes GeeSports events and parses their local date format", function () {
    var context = loadApi();
    var event = context.SportzXApiUtils.normalizeEvent({
        event: JSON.stringify({
            visible: true,
            priority: 2,
            category: "World Cup",
            eventName: "Spain vs Argentina",
            teamAName: "Spain",
            teamBName: "Argentina",
            date: "19/07/2026",
            time: "18:45:00",
            link_names: ["Feed 1", "Feed 2"],
            links: "pro/event.txt"
        })
    }, 0);
    var start = context.SportzXApiUtils.parseEventTime(event.eventInfo.startTime);

    assert.equal(event.id, "pro/event.txt");
    assert.equal(event.cat, "World Cup");
    assert.equal(event.formats.length, 2);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 6);
    assert.equal(start.getDate(), 19);
    assert.equal(start.getHours(), 18);
});

test("recognizes GeeSports ClearKey feeds while keeping direct HLS playable", function () {
    var context = loadApi();
    var clearKey = context.SportzXApiUtils.normalizeStream({
        name: "DASH",
        link: "https://cdn.example/live/manifest.mpd",
        api: "00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100",
        scheme: 0
    }, 0);
    var hls = context.SportzXApiUtils.normalizeStream({
        name: "HLS",
        link: "https://cdn.example/live/playlist.m3u8",
        scheme: 0
    }, 1);

    assert.equal(clearKey.title, "DASH");
    assert.equal(clearKey.drmType, "clearkey");
    assert.equal(context.SportzXApiUtils.streamSupport(clearKey).supported, false);
    assert.equal(context.SportzXApiUtils.streamSupport(hls).supported, true);
});

test("keeps GeeSports embed resolver rows visible but marks them Android-only", function () {
    var context = loadApi();
    var embed = context.SportzXApiUtils.normalizeStream({
        name: "XTREME FHD",
        link: "",
        tokenApi: JSON.stringify({
            api: "https://embed.example/event",
            type: "embed",
            link_key: "playback_url"
        })
    }, 0);

    assert.equal(embed.link, "https://embed.example/event");
    assert.equal(embed.type, 2);
    assert.equal(context.SportzXApiUtils.streamSupport(embed).code, "ANDROID_WEBVIEW_REQUIRED");
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
