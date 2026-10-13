const fs = require('node:fs');
require('../backend/node_modules/dotenv').config({ path: require('node:path').resolve(__dirname, '../backend/.env'), quiet: true });
require('../backend/node_modules/dotenv').config({ path: require('node:path').resolve(__dirname, '../backend/.env.local'), quiet: true, override: true });
const { extractOldMenu } = require('../backend/dist/services/oldMenuImport');
// Use the OS HTTPS stack for this local verification; Node TLS is blocked on this machine.
global.fetch = (url, options) => new Promise((resolve, reject) => {
    const child = require('node:child_process').execFile('powershell', ['-NoProfile', '-File', require('node:path').resolve(__dirname, 'menu-ai-transport.ps1'), url], { maxBuffer: 1_000_000 }, (error, output) => {
        if (error) return reject(new Error('Unable to reach Google AI'));
        try { const result = JSON.parse(output); resolve(new Response(result.body, { status: result.status })); } catch { reject(new Error('Invalid verification transport response')); }
    });
    child.stdin.end(JSON.stringify({ key: options.headers['x-goog-api-key'], body: options.body }));
});
extractOldMenu({ file: `data:image/jpeg;base64,${fs.readFileSync(require('node:path').resolve(__dirname, 'imported-menu-reference.jpg')).toString('base64')}` }).then(menu => {
    fs.writeFileSync(require('node:path').resolve(__dirname, 'extracted-picture-menu.json'), JSON.stringify(menu));
    console.log(JSON.stringify({ name: menu.name, pricePrefix: menu.pricePrefix, style: menu.style, sections: menu.sections.map(section => ({ name: section.name, itemsBox: section.itemsBox, headingBox: section.headingBox, items: section.items.length })) }));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
