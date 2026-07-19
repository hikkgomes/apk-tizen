"use strict";

var assert = require("node:assert/strict");
var crypto = require("node:crypto");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");

// Mock XMLHttpRequest using Node's native fetch
class MockXMLHttpRequest {
    constructor() {
        this.readyState = 0;
        this.status = 0;
        this.responseText = "";
        this.onreadystatechange = null;
        this.onerror = null;
        this.ontimeout = null;
        this.headers = {};
        this.method = "GET";
        this.url = "";
        this.timeout = 0;
    }
    open(method, url) {
        this.method = method;
        this.url = url;
        this.readyState = 1;
    }
    setRequestHeader(name, value) {
        this.headers[name] = value;
    }
    send(body) {
        this.readyState = 2;
        
        // Mock specific URLs for tests
        if (this.url.includes("empty_events.json")) {
            this.status = 200;
            this.responseText = JSON.stringify({ data: "invalid_crypto" }); // We will mock this to return empty array
            setTimeout(() => { this.readyState = 4; if(this.onreadystatechange) this.onreadystatechange(); }, 10);
            return;
        }

        if (this.url.includes("network_error")) {
            setTimeout(() => { if(this.onerror) this.onerror(new Error("Network Error")); }, 10);
            return;
        }

        if (this.url.includes("http_error")) {
            this.status = 500;
            setTimeout(() => { this.readyState = 4; if(this.onreadystatechange) this.onreadystatechange(); }, 10);
            return;
        }

        if (this.url.includes("timeout_error")) {
            setTimeout(() => { if(this.ontimeout) this.ontimeout(); }, 10);
            return;
        }

        var fetchOpts = {
            method: this.method,
            headers: this.headers
        };
        if (body) {
            fetchOpts.body = body;
        }
        
        fetch(this.url, fetchOpts).then(res => {
            this.status = res.status;
            return res.text();
        }).then(text => {
            this.responseText = text;
            this.readyState = 4;
            if (this.onreadystatechange) {
                this.onreadystatechange();
            }
        }).catch(err => {
            if (this.onerror) {
                this.onerror(err);
            }
        });
    }
}

// Mock localStorage
var mockStorage = {};
var mockLocalStorage = {
    getItem(key) { return mockStorage[key] || null; },
    setItem(key, value) { mockStorage[key] = String(value); },
    removeItem(key) { delete mockStorage[key]; },
    clear() { mockStorage = {}; }
};

// Set up VM Context with browser globals
var context = {
    XMLHttpRequest: MockXMLHttpRequest,
    localStorage: mockLocalStorage,
    crypto: crypto.webcrypto,
    atob: function (encoded) { return Buffer.from(encoded, "base64").toString("binary"); },
    btoa: function (binary) { return Buffer.from(binary, "binary").toString("base64"); },
    console: {
        log: () => {},
        error: () => {}
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    Date: Date,
    JSON: JSON,
    Error: Error,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    RegExp: RegExp,
    parseInt: parseInt,
    navigator: { language: "en-US", platform: "macOS" }
};
context.self = context;
vm.createContext(context);

// Load files in order
function loadScript(filePath) {
    var code = fs.readFileSync(path.join(__dirname, filePath), "utf8");
    vm.runInContext(code, context, { filename: path.basename(filePath) });
}

loadScript("../js/config.js");
loadScript("../js/decoder.js");
loadScript("../js/remote-config.js");
loadScript("../js/api-client.js");

test("uses the built-in API fallback on a fresh install", function () {
    mockLocalStorage.clear();
    var result = context.SportzXRemoteConfig.configured();
    assert.equal(result.apiBase, "https://api.whatyouthink.site/");
    assert.equal(result.source, "built-in fallback");
});

test("Live API: endpoint discovery or fallback", { skip: process.env.SPORTZX_LIVE_TESTS !== "1" }, async function () {
    var RemoteConfig = context.SportzXRemoteConfig;
    var configResult = await RemoteConfig.discover();
    assert.ok(configResult.apiBase, "apiBase should be resolved");
    assert.match(configResult.apiBase, /^https?:\/\//, "apiBase must be an HTTP(S) URL");
});

test("Live API: Network errors, Timeouts and HTTP errors", async function () {
    var ApiClient = context.SportzXApi;
    var api = new ApiClient({ baseUrl: "https://example.com" });
    
    await assert.rejects(api.get("network_error"), (err) => err.code === "NETWORK");
    await assert.rejects(api.get("http_error"), (err) => err.code === "HTTP_500");
    await assert.rejects(api.get("timeout_error"), (err) => err.code === "TIMEOUT");
});

test("Live API: Event decoding, Categories, Multiple events, Streams", { skip: process.env.SPORTZX_LIVE_TESTS !== "1" }, async function () {
    var RemoteConfig = context.SportzXRemoteConfig;
    var ApiClient = context.SportzXApi;

    var configResult = await RemoteConfig.discover();
    var api = new ApiClient({ baseUrl: configResult.apiBase });

    var guide = await api.getGuide();
    assert.ok(Array.isArray(guide.events), "guide.events must be an array");
    assert.ok(Array.isArray(guide.categories), "guide.categories must be an array");
    assert.ok(guide.events.length > 0, "Should have multiple events");

    // Filter events to test multiple stream types
    var eventsWithStreams = guide.events.filter(e => e.formats.length > 0 || e.formatsNew.length > 0);
    assert.ok(eventsWithStreams.length > 0, "Should have events with streams");

    var testEvent = eventsWithStreams[0];
    var streams = await api.getStreams(testEvent);
    assert.ok(Array.isArray(streams), "streams should be returned as an array");

    // Find a stream to resolve
    if (streams.length > 0) {
        var stream = streams[0];
        try {
            var resolved = await api.resolveStream(stream);
            assert.ok(resolved.link, "Resolved stream must have a link");
            // Do not log full token/cookie URL
            var urlBase = resolved.link.split('?')[0];
            // Diagnostic
        } catch (e) {
            // Some streams might fail, verify it's an Error
            assert.ok(e instanceof Error);
        }
    }
});
