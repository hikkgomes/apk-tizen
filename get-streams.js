const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.crypto = { getRandomValues: (a) => crypto.randomFillSync(a) };
global.window = global;

const decoderCode = fs.readFileSync('js/decoder.js', 'utf8');
require('vm').runInThisContext(decoderCode);
const decoder = global.SportzXDecoder;

const fetch = (url) => new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'okhttp/4.12.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
    }).on('error', reject);
});

async function run() {
    const baseUrl = 'https://api.whatyouthink.site/';
    const eventsStr = await fetch(baseUrl + 'events.txt');
    const rows = JSON.parse(await decoder.decodeGeeSportsPayload(eventsStr));
    const events = rows.map(row => JSON.parse(row.event)).filter(event => event.visible !== false);

    let tested = 0;
    for (const ev of events) {
        if (!ev.links) continue;
        console.log(`\nEvent: ${ev.eventName}`);
        const streamsStr = await fetch(baseUrl + ev.links);
        const streams = JSON.parse(await decoder.decodeGeeSportsPayload(streamsStr));
        streams.forEach(stream => {
            const kind = stream.api ? 'encrypted DASH' : 'direct stream';
            console.log(`- ${stream.name}: ${kind} (${stream.link.split('|')[0]})`);
        });
        tested++;
        if (tested >= 3) break;
    }
}
run().catch(console.error);
