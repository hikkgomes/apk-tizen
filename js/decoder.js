(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(root, typeof require === "function" ? require : null);
    } else {
        root.SportzXDecoder = factory(root, null);
    }
}(
    typeof self !== "undefined" ? self :
        (typeof window !== "undefined" ? window :
            (typeof global !== "undefined" ? global : this)),
    function (root, nodeRequire) {
        "use strict";

        var DEVICE_KEY_HEX = "1676ec7db4771b0d826d70369b579684b182d2c0133be041bdd55f5d6d79a98b";
        var SHA256_BLOCK_SIZE = 64;
        var SHA256_OUTPUT_SIZE = 32;
        var SHA256_CONSTANTS = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
            0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
            0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
            0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
            0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
            0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
            0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
            0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        function copyBytes(bytes) {
            var copy = new Uint8Array(bytes.length);
            copy.set(bytes);
            return copy;
        }

        function toBytes(value) {
            if (value instanceof Uint8Array) {
                return value;
            }

            if (value && value.buffer && typeof value.byteLength === "number") {
                return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
            }

            if (value && typeof value.length === "number") {
                return new Uint8Array(value);
            }

            throw new TypeError("Expected a byte array");
        }

        function sliceBytes(bytes, start, end) {
            var length = end - start;
            var result = new Uint8Array(length);
            var i;

            for (i = 0; i < length; i += 1) {
                result[i] = bytes[start + i];
            }

            return result;
        }

        function concatBytes(parts) {
            var totalLength = 0;
            var result;
            var offset = 0;
            var i;
            var part;

            for (i = 0; i < parts.length; i += 1) {
                totalLength += parts[i].length;
            }

            result = new Uint8Array(totalLength);
            for (i = 0; i < parts.length; i += 1) {
                part = parts[i];
                result.set(part, offset);
                offset += part.length;
            }

            return result;
        }

        function hexToBytes(hex) {
            var result;
            var i;

            if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
                throw new Error("Invalid hexadecimal byte string");
            }

            result = new Uint8Array(hex.length / 2);
            for (i = 0; i < result.length; i += 1) {
                result[i] = parseInt(hex.substr(i * 2, 2), 16);
            }

            return result;
        }

        function bytesToHex(value) {
            var bytes = toBytes(value);
            var hex = "";
            var i;

            for (i = 0; i < bytes.length; i += 1) {
                hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
            }

            return hex;
        }

        function decodeBase64Url(encoded) {
            var unpadded;
            var paddingLength;
            var remainder;
            var normalized;
            var binary;
            var result;
            var i;
            var BufferConstructor;

            if (typeof encoded !== "string") {
                throw new TypeError("Envelope must be a URL-safe Base64 string");
            }

            if (!/^[A-Za-z0-9_-]*={0,2}$/.test(encoded)) {
                throw new Error("Invalid URL-safe Base64 envelope");
            }

            unpadded = encoded.replace(/=+$/, "");
            paddingLength = encoded.length - unpadded.length;
            remainder = unpadded.length % 4;

            if (remainder === 1 || (paddingLength > 0 && encoded.length % 4 !== 0)) {
                throw new Error("Invalid URL-safe Base64 envelope length");
            }

            if (paddingLength > 0 && paddingLength !== ((4 - remainder) % 4)) {
                throw new Error("Invalid URL-safe Base64 envelope padding");
            }

            normalized = unpadded.replace(/-/g, "+").replace(/_/g, "/");
            while (normalized.length % 4 !== 0) {
                normalized += "=";
            }

            try {
                if (root && typeof root.atob === "function") {
                    binary = root.atob(normalized);
                    result = new Uint8Array(binary.length);
                    for (i = 0; i < binary.length; i += 1) {
                        result[i] = binary.charCodeAt(i);
                    }
                    return result;
                }

                BufferConstructor = root && root.Buffer;
                if (!BufferConstructor && nodeRequire) {
                    BufferConstructor = nodeRequire("buffer").Buffer;
                }

                if (BufferConstructor) {
                    if (typeof BufferConstructor.from === "function") {
                        return copyBytes(BufferConstructor.from(normalized, "base64"));
                    }
                    return copyBytes(new BufferConstructor(normalized, "base64"));
                }
            } catch (error) {
                throw new Error("Invalid URL-safe Base64 envelope");
            }

            throw new Error("No Base64 decoder is available");
        }

        function rotateRight8(value, amount) {
            var shift = amount % 8;
            var byte = value & 0xff;

            if (shift < 0) {
                shift += 8;
            }

            if (shift === 0) {
                return byte;
            }

            return ((byte >>> shift) | (byte << (8 - shift))) & 0xff;
        }

        function rotateRight32(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }

        function sha256(value) {
            var bytes = toBytes(value);
            var totalLength = Math.ceil((bytes.length + 9) / SHA256_BLOCK_SIZE) * SHA256_BLOCK_SIZE;
            var padded = new Uint8Array(totalLength);
            var bitLengthHigh = Math.floor(bytes.length / 0x20000000);
            var bitLengthLow = (bytes.length << 3) >>> 0;
            var words = new Array(64);
            var h0 = 0x6a09e667;
            var h1 = 0xbb67ae85;
            var h2 = 0x3c6ef372;
            var h3 = 0xa54ff53a;
            var h4 = 0x510e527f;
            var h5 = 0x9b05688c;
            var h6 = 0x1f83d9ab;
            var h7 = 0x5be0cd19;
            var offset;
            var i;
            var smallSigma0;
            var smallSigma1;
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var bigSigma0;
            var bigSigma1;
            var choice;
            var majority;
            var temporary1;
            var temporary2;
            var digest;

            padded.set(bytes);
            padded[bytes.length] = 0x80;
            padded[totalLength - 8] = (bitLengthHigh >>> 24) & 0xff;
            padded[totalLength - 7] = (bitLengthHigh >>> 16) & 0xff;
            padded[totalLength - 6] = (bitLengthHigh >>> 8) & 0xff;
            padded[totalLength - 5] = bitLengthHigh & 0xff;
            padded[totalLength - 4] = (bitLengthLow >>> 24) & 0xff;
            padded[totalLength - 3] = (bitLengthLow >>> 16) & 0xff;
            padded[totalLength - 2] = (bitLengthLow >>> 8) & 0xff;
            padded[totalLength - 1] = bitLengthLow & 0xff;

            for (offset = 0; offset < totalLength; offset += SHA256_BLOCK_SIZE) {
                for (i = 0; i < 16; i += 1) {
                    words[i] = (
                        (padded[offset + (i * 4)] << 24) |
                        (padded[offset + (i * 4) + 1] << 16) |
                        (padded[offset + (i * 4) + 2] << 8) |
                        padded[offset + (i * 4) + 3]
                    );
                }

                for (i = 16; i < 64; i += 1) {
                    smallSigma0 = rotateRight32(words[i - 15], 7) ^
                        rotateRight32(words[i - 15], 18) ^
                        (words[i - 15] >>> 3);
                    smallSigma1 = rotateRight32(words[i - 2], 17) ^
                        rotateRight32(words[i - 2], 19) ^
                        (words[i - 2] >>> 10);
                    words[i] = (words[i - 16] + smallSigma0 + words[i - 7] + smallSigma1) | 0;
                }

                a = h0;
                b = h1;
                c = h2;
                d = h3;
                e = h4;
                f = h5;
                g = h6;
                h = h7;

                for (i = 0; i < 64; i += 1) {
                    bigSigma1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
                    choice = (e & f) ^ ((~e) & g);
                    temporary1 = (h + bigSigma1 + choice + SHA256_CONSTANTS[i] + words[i]) | 0;
                    bigSigma0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
                    majority = (a & b) ^ (a & c) ^ (b & c);
                    temporary2 = (bigSigma0 + majority) | 0;

                    h = g;
                    g = f;
                    f = e;
                    e = (d + temporary1) | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = (temporary1 + temporary2) | 0;
                }

                h0 = (h0 + a) | 0;
                h1 = (h1 + b) | 0;
                h2 = (h2 + c) | 0;
                h3 = (h3 + d) | 0;
                h4 = (h4 + e) | 0;
                h5 = (h5 + f) | 0;
                h6 = (h6 + g) | 0;
                h7 = (h7 + h) | 0;
            }

            digest = new Uint8Array(SHA256_OUTPUT_SIZE);
            writeUint32(digest, 0, h0);
            writeUint32(digest, 4, h1);
            writeUint32(digest, 8, h2);
            writeUint32(digest, 12, h3);
            writeUint32(digest, 16, h4);
            writeUint32(digest, 20, h5);
            writeUint32(digest, 24, h6);
            writeUint32(digest, 28, h7);
            return digest;
        }

        function writeUint32(target, offset, value) {
            target[offset] = (value >>> 24) & 0xff;
            target[offset + 1] = (value >>> 16) & 0xff;
            target[offset + 2] = (value >>> 8) & 0xff;
            target[offset + 3] = value & 0xff;
        }

        function hmacSha256(keyValue, messageValue) {
            var key = toBytes(keyValue);
            var message = toBytes(messageValue);
            var normalizedKey = key.length > SHA256_BLOCK_SIZE ? sha256(key) : key;
            var innerPad = new Uint8Array(SHA256_BLOCK_SIZE);
            var outerPad = new Uint8Array(SHA256_BLOCK_SIZE);
            var i;

            for (i = 0; i < SHA256_BLOCK_SIZE; i += 1) {
                innerPad[i] = (i < normalizedKey.length ? normalizedKey[i] : 0) ^ 0x36;
                outerPad[i] = (i < normalizedKey.length ? normalizedKey[i] : 0) ^ 0x5c;
            }

            return sha256(concatBytes([
                outerPad,
                sha256(concatBytes([innerPad, message]))
            ]));
        }

        function deviceKeyBytes() {
            return hexToBytes(DEVICE_KEY_HEX);
        }

        function deriveKeyMaterial(saltValue) {
            var salt = toBytes(saltValue);
            var info = concatBytes([salt, deviceKeyBytes()]);
            var pseudoRandomKey = sha256(info);
            var output = new Uint8Array(48);
            var previous = new Uint8Array(0);
            var generated = 0;
            var counter = 1;
            var block;
            var take;

            while (generated < output.length) {
                block = hmacSha256(pseudoRandomKey, concatBytes([
                    previous,
                    info,
                    new Uint8Array([counter])
                ]));
                take = Math.min(block.length, output.length - generated);
                output.set(sliceBytes(block, 0, take), generated);
                generated += take;
                previous = block;
                counter += 1;
            }

            return output;
        }

        function parseEnvelope(encoded) {
            var bytes = decodeBase64Url(encoded);
            var saltLength;
            var ciphertextEnd;
            var ciphertextLength;

            if (bytes.length < 5) {
                throw new Error("Malformed envelope: header is truncated");
            }

            if (bytes[0] !== 0xde || bytes[1] !== 0xad || bytes[2] !== 0xbe || bytes[3] !== 0xef) {
                throw new Error("Malformed envelope: invalid magic bytes");
            }

            saltLength = bytes[4];
            if (saltLength > bytes.length - 5) {
                throw new Error("Malformed envelope: salt length exceeds payload");
            }

            ciphertextEnd = bytes.length - saltLength;
            ciphertextLength = ciphertextEnd - 5;
            if (ciphertextLength === 0) {
                throw new Error("Malformed envelope: ciphertext is empty");
            }

            if (ciphertextLength % 16 !== 0) {
                throw new Error("Malformed envelope: ciphertext is not AES block aligned");
            }

            return {
                ciphertext: sliceBytes(bytes, 5, ciphertextEnd),
                salt: sliceBytes(bytes, ciphertextEnd, bytes.length)
            };
        }

        function bytesToArrayBuffer(bytesValue) {
            return copyBytes(toBytes(bytesValue)).buffer;
        }

        function cryptoProvider(override) {
            var nodeCrypto;

            if (override) {
                return override;
            }

            if (root && root.crypto) {
                return root.crypto;
            }

            if (root && root.msCrypto) {
                return root.msCrypto;
            }

            if (nodeRequire) {
                try {
                    nodeCrypto = nodeRequire("crypto");
                    if (nodeCrypto.webcrypto) {
                        return nodeCrypto.webcrypto;
                    }
                } catch (ignore) {
                    /* The caller receives the more useful WebCrypto error below. */
                }
            }

            return null;
        }

        function decryptAes256Cbc(ciphertextValue, keyValue, ivValue, providerOverride) {
            var ciphertext = toBytes(ciphertextValue);
            var key = toBytes(keyValue);
            var iv = toBytes(ivValue);
            var provider = cryptoProvider(providerOverride);
            var subtle = provider && (provider.subtle || provider.webkitSubtle || provider);

            if (!subtle || typeof subtle.importKey !== "function" || typeof subtle.decrypt !== "function") {
                throw new Error("WebCrypto AES-CBC support is required");
            }

            if (key.length !== 32 || iv.length !== 16 || ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
                throw new Error("Invalid AES-256-CBC inputs");
            }

            return subtle.importKey(
                "raw",
                bytesToArrayBuffer(key),
                { name: "AES-CBC" },
                false,
                ["decrypt"]
            ).then(function (cryptoKey) {
                return subtle.decrypt(
                    { name: "AES-CBC", iv: bytesToArrayBuffer(iv) },
                    cryptoKey,
                    bytesToArrayBuffer(ciphertext)
                );
            }).then(function (plaintext) {
                return new Uint8Array(plaintext);
            });
        }

        function transformPlaintext(rawValue) {
            var raw = toBytes(rawValue);
            var deviceKey = deviceKeyBytes();
            var result = new Uint8Array(raw.length);
            var i;

            for (i = 0; i < raw.length; i += 1) {
                result[i] = rotateRight8(raw[i], 3) ^ deviceKey[i % deviceKey.length];
            }

            return result;
        }

        function utf8Decode(value) {
            var bytes = toBytes(value);
            var codeUnits = [];
            var chunks = [];
            var i = 0;
            var first;
            var second;
            var third;
            var fourth;
            var codePoint;
            var chunkStart;

            function continuation(byte) {
                return (byte & 0xc0) === 0x80;
            }

            while (i < bytes.length) {
                first = bytes[i];

                if (first <= 0x7f) {
                    codeUnits.push(first);
                    i += 1;
                } else if (first >= 0xc2 && first <= 0xdf) {
                    if (i + 1 >= bytes.length || !continuation(bytes[i + 1])) {
                        throw new Error("Decrypted response is not valid UTF-8");
                    }
                    second = bytes[i + 1];
                    codeUnits.push(((first & 0x1f) << 6) | (second & 0x3f));
                    i += 2;
                } else if (first >= 0xe0 && first <= 0xef) {
                    if (i + 2 >= bytes.length ||
                            !continuation(bytes[i + 1]) ||
                            !continuation(bytes[i + 2])) {
                        throw new Error("Decrypted response is not valid UTF-8");
                    }
                    second = bytes[i + 1];
                    third = bytes[i + 2];
                    if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second > 0x9f)) {
                        throw new Error("Decrypted response is not valid UTF-8");
                    }
                    codeUnits.push(
                        ((first & 0x0f) << 12) |
                        ((second & 0x3f) << 6) |
                        (third & 0x3f)
                    );
                    i += 3;
                } else if (first >= 0xf0 && first <= 0xf4) {
                    if (i + 3 >= bytes.length ||
                            !continuation(bytes[i + 1]) ||
                            !continuation(bytes[i + 2]) ||
                            !continuation(bytes[i + 3])) {
                        throw new Error("Decrypted response is not valid UTF-8");
                    }
                    second = bytes[i + 1];
                    third = bytes[i + 2];
                    fourth = bytes[i + 3];
                    if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second > 0x8f)) {
                        throw new Error("Decrypted response is not valid UTF-8");
                    }
                    codePoint = ((first & 0x07) << 18) |
                        ((second & 0x3f) << 12) |
                        ((third & 0x3f) << 6) |
                        (fourth & 0x3f);
                    codePoint -= 0x10000;
                    codeUnits.push(0xd800 + (codePoint >>> 10));
                    codeUnits.push(0xdc00 + (codePoint & 0x3ff));
                    i += 4;
                } else {
                    throw new Error("Decrypted response is not valid UTF-8");
                }
            }

            for (chunkStart = 0; chunkStart < codeUnits.length; chunkStart += 0x8000) {
                chunks.push(String.fromCharCode.apply(
                    String,
                    codeUnits.slice(chunkStart, chunkStart + 0x8000)
                ));
            }

            return chunks.join("");
        }

        function promiseConstructor() {
            if (root && root.Promise) {
                return root.Promise;
            }

            if (typeof Promise !== "undefined") {
                return Promise;
            }

            throw new Error("Promise support is required");
        }

        function decodeEnvelope(encoded, providerOverride) {
            var PromiseConstructor = promiseConstructor();

            return PromiseConstructor.resolve().then(function () {
                var envelope = parseEnvelope(encoded);
                var material = deriveKeyMaterial(envelope.salt);
                var key = sliceBytes(material, 0, 32);
                var iv = sliceBytes(material, 32, 48);

                return decryptAes256Cbc(
                    envelope.ciphertext,
                    key,
                    iv,
                    providerOverride
                );
            }).then(function (rawPlaintext) {
                return utf8Decode(transformPlaintext(rawPlaintext));
            });
        }

        return {
            DEVICE_KEY_HEX: DEVICE_KEY_HEX,
            decodeEnvelope: decodeEnvelope,
            parseEnvelope: parseEnvelope,
            decodeBase64Url: decodeBase64Url,
            deriveKeyMaterial: deriveKeyMaterial,
            decryptAes256Cbc: decryptAes256Cbc,
            transformPlaintext: transformPlaintext,
            utf8Decode: utf8Decode,
            sha256: sha256,
            hmacSha256: hmacSha256,
            rotateRight8: rotateRight8,
            hexToBytes: hexToBytes,
            bytesToHex: bytesToHex
        };
    }
));
