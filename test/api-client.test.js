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
    getItem(key) {
        return mockStorage[key] || null;
    },
    setItem(key, value) {
        mockStorage[key] = String(value);
    },
    removeItem(key) {
        delete mockStorage[key];
    },
    clear() {
        mockStorage = {};
    }
};

// Set up VM Context with browser globals
var context = {
    XMLHttpRequest: MockXMLHttpRequest,
    localStorage: mockLocalStorage,
    crypto: crypto.webcrypto,
    atob: function (encoded) {
        return Buffer.from(encoded, "base64").toString("binary");
    },
    btoa: function (binary) {
        return Buffer.from(binary, "binary").toString("base64");
    },
    console: console,
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
    navigator: {
        language: "en-US",
        platform: "macOS"
    }
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

test("end-to-end live API config discovery, event guide retrieval, and decryption", async function () {
    var RemoteConfig = context.SportzXRemoteConfig;
    var ApiClient = context.SportzXApi;

    // 1. Run live config discovery
    console.log("Discovering Remote Config...");
    var configResult = await RemoteConfig.discover();
    
    assert.ok(configResult.apiBase, "apiBase should be resolved");
    assert.match(configResult.apiBase, /^https?:\/\//, "apiBase must be an HTTP(S) URL");
    console.log("Discovered API Base:", configResult.apiBase);

    // 2. Initialize API Client
    var api = new ApiClient({
        baseUrl: configResult.apiBase,
        userAgent: configResult.userAgent || "SportzX TV Agent"
    });

    // 3. Fetch live event guide
    console.log("Fetching live events and categories guide...");
    var guide = await api.getGuide();
    
    assert.ok(Array.isArray(guide.events), "guide.events must be an array");
    assert.ok(Array.isArray(guide.categories), "guide.categories must be an array");
    console.log(`Fetched ${guide.events.length} events and ${guide.categories.length} categories.`);

    if (guide.events.length > 0) {
        var firstEvent = guide.events[0];
        assert.ok(firstEvent.id, "Event must have an ID");
        assert.ok(firstEvent.eventInfo.eventName, "Event must have a name");
        console.log("First Event Name:", firstEvent.eventInfo.eventName);

        // 4. Fetch streams for the first event
        console.log(`Fetching stream sources for event ID ${firstEvent.id}...`);
        var streams = await api.getStreams(firstEvent);
        assert.ok(Array.isArray(streams), "streams should be returned as an array");
        console.log(`Resolved ${streams.length} stream feeds.`);

        if (streams.length > 0) {
            var firstStream = streams[0];
            assert.ok(firstStream.title, "Stream must have a title");
            assert.ok(firstStream.link, "Stream must have a link");
            console.log("First Stream Source:", firstStream.title, "->", firstStream.link);

            // 5. Try resolving stream
            console.log("Resolving playback URL for the stream...");
            var resolved = await api.resolveStream(firstStream);
            assert.ok(resolved.link, "Resolved stream must have a link");
            console.log("Playback URL resolved:", resolved.link);
        }
    }
});
