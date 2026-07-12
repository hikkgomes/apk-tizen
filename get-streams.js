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
    const eventsStr = await fetch('https://mymodi.top/events.json');
    const events = decoder.decodeEnvelope(eventsStr);
    
    let tested = 0;
    for (const ev of events) {
        if (!ev.formats || ev.formats.length === 0) continue;
        console.log(`\nEvent: ${ev.eventInfo.eventName}`);
        
        for (const fmt of ev.formats) {
            const streamsStr = await fetch(`https://mymodi.top/eventDetails/${ev.eventInfo.eventId}/${fmt.formatId}.json`);
            let streams = [];
            try { streams = decoder.decodeEnvelope(streamsStr); } catch(e) {}
            
            for (const s of streams) {
                const url = s.stream_url.startsWith('http') ? s.stream_url : `https://mymodi.top/${s.stream_url}`;
                let streamDef = s;
                if (!s.stream_url.startsWith('http') && s.stream_url.endsWith('.json')) {
                    const resolvedStr = await fetch(url);
                    streamDef = decoder.decodeEnvelope(resolvedStr);
                }
                const link = streamDef.link || streamDef.stream_url;
                console.log(`- Resolved: ${link}`);
                
                const { execSync } = require('child_process');
                try {
                    const hLink = link.replace(/^https:/, 'http:');
                    const httpsHead = execSync(`curl -s -L -I "${link}"`, {encoding:'utf8'}).split('\n')[0];
                    console.log(`  HTTPS HEAD:`, httpsHead);
                    
                    const httpHead = execSync(`curl -s -L -I "${hLink}"`, {encoding:'utf8'}).split('\n')[0];
                    console.log(`  HTTP HEAD:`, httpHead);
                } catch(e) {
                    console.log("  Curl failed");
                }
            }
        }
        tested++;
        if (tested >= 3) break;
    }
}
run().catch(console.error);
