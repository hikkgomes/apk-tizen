const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`, { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
global.XMLHttpRequest = dom.window.XMLHttpRequest;
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
global.crypto = { getRandomValues: (arr) => require('crypto').randomFillSync(arr) };
global.navigator = dom.window.navigator;
global.localStorage = { getItem: () => null, setItem: () => null, removeItem: () => null };

const runScript = (path) => {
    const code = fs.readFileSync(path, 'utf8');
    const fn = new Function('root', 'window', 'document', 'navigator', 'localStorage', code);
    fn.call(global, global, global.window, global.document, global.navigator, global.localStorage);
};

runScript('js/config.js');
runScript('js/decoder.js');
runScript('js/remote-config.js');
runScript('js/api-client.js');

async function run() {
    const api = new global.SportzXApi({ baseUrl: "https://api.whatyouthink.site/", userAgent: "okhttp/4.12.0" });
    const guide = await api.getGuide();
    
    let tested = 0;
    for (const event of guide.events) {
        if (event.formats && event.formats.length > 0) {
            console.log(`\nEvent: ${event.eventInfo.eventName}`);
            const streams = await api.getStreams(event);
            for (let i = 0; i < streams.length; i++) {
                const stream = streams[i];
                const resolved = await api.resolveStream(stream);
                const link = resolved.link;
                console.log(`  Stream ${i+1}: ${link}`);
                
                const { execSync } = require('child_process');
                try {
                    const headers = Object.keys(resolved.headers || {}).map(k => `-H "${k}: ${resolved.headers[k]}"`).join(' ');
                    
                    const httpsHead = execSync(`curl -s -L -I ${headers} -A "okhttp/4.12.0" "${link}"`, { encoding: 'utf8' }).split('\n')[0];
                    console.log(`    HTTPS: ${httpsHead}`);
                    
                    const httpLink = link.replace(/^https:/, 'http:');
                    const httpHead = execSync(`curl -s -L -I ${headers} -A "okhttp/4.12.0" "${httpLink}"`, { encoding: 'utf8' }).split('\n')[0];
                    console.log(`    HTTP: ${httpHead}`);
                } catch(e) {
                    console.log(`    Curl failed`);
                }
            }
            tested++;
            if (tested >= 3) break;
        }
    }
}
run().catch(console.error);
