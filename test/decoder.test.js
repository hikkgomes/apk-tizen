"use strict";

var assert = require("node:assert/strict");
var crypto = require("node:crypto");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");
var decoder = require("../js/decoder.js");

var VECTOR = "3q2-7wZ1MCLV9YNJ0uDf2LSDrnLkU3g3UTlr";

function encodeBase64Url(bytes) {
    return Buffer.from(bytes).toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

test("parses the envelope framing and derives the expected key material", function () {
    var envelope = decoder.parseEnvelope(VECTOR);

    assert.equal(decoder.bytesToHex(envelope.ciphertext), "753022d5f58349d2e0dfd8b483ae72e4");
    assert.equal(decoder.bytesToHex(envelope.salt), "53783751396b");
    assert.equal(
        decoder.bytesToHex(decoder.deriveKeyMaterial(envelope.salt)),
        "1c6e57dffabae53c8e134e0f35cf5c758ae1483e66e653a02a436e44c9709c2c" +
            "d36f6182de1ed78ca460407e3b17d358"
    );
});

test("decodes the known response vector", async function () {
    assert.equal(await decoder.decodeEnvelope(VECTOR), "Hello World");
});

test("rejects invalid Base64 and malformed envelope framing", async function (t) {
    var malformed = [
        {
            name: "invalid Base64 alphabet",
            encoded: "not+url/base64",
            error: /Invalid URL-safe Base64/
        },
        {
            name: "truncated header",
            encoded: encodeBase64Url([0xde, 0xad, 0xbe, 0xef]),
            error: /header is truncated/
        },
        {
            name: "wrong magic bytes",
            encoded: encodeBase64Url([0xdf, 0xad, 0xbe, 0xef, 0]),
            error: /invalid magic bytes/
        },
        {
            name: "salt length beyond payload",
            encoded: encodeBase64Url([0xde, 0xad, 0xbe, 0xef, 2, 0]),
            error: /salt length exceeds payload/
        },
        {
            name: "empty ciphertext",
            encoded: encodeBase64Url([0xde, 0xad, 0xbe, 0xef, 0]),
            error: /ciphertext is empty/
        },
        {
            name: "non-block-aligned ciphertext",
            encoded: encodeBase64Url([0xde, 0xad, 0xbe, 0xef, 0, 0]),
            error: /not AES block aligned/
        }
    ];
    var i;

    for (i = 0; i < malformed.length; i += 1) {
        await t.test(malformed[i].name, async function (testCase) {
            await assert.rejects(
                decoder.decodeEnvelope(testCase.encoded, {}),
                testCase.error
            );
        }.bind(null, malformed[i]));
    }
});

test("loads as a browser global without CommonJS or runtime dependencies", async function () {
    var source = fs.readFileSync(path.join(__dirname, "../js/decoder.js"), "utf8");
    var context = {
        ArrayBuffer: ArrayBuffer,
        Promise: Promise,
        Uint8Array: Uint8Array,
        crypto: crypto.webcrypto,
        atob: function (encoded) {
            return Buffer.from(encoded, "base64").toString("binary");
        }
    };

    context.self = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "decoder.js" });

    assert.equal(typeof context.SportzXDecoder.decodeEnvelope, "function");
    assert.equal(await context.SportzXDecoder.decodeEnvelope(VECTOR), "Hello World");
});
