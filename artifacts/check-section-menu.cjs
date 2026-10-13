const fs = require('node:fs');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env.local'), quiet: true, override: true });
const { suggestInventoryMenu } = require('../backend/dist/services/inventoryMenuAI');
global.fetch = (url, options) => new Promise((resolve, reject) => {
    const child = require('node:child_process').execFile('powershell', ['-NoProfile', '-File', path.resolve(__dirname, 'menu-ai-transport.ps1'), url], { maxBuffer: 1_000_000 }, (error, output) => {
        if (error) return reject(new Error('Unable to reach Google AI'));
        try { const result = JSON.parse(output); resolve(new Response(result.body, { status: result.status })); } catch { reject(new Error('Invalid verification transport response')); }
    });
    child.stdin.end(JSON.stringify({ key: options.headers['x-goog-api-key'], body: options.body }));
});
const extracted = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'extracted-picture-menu.json')));
const inventory = extracted.sections.flatMap(section => section.items.map(item => ({ id: '', name: item.name, category: section.name, price: item.price || 10 }))).map((item,index)=>({...item,id:`photo-item-${index}`}));
fs.writeFileSync(path.resolve(__dirname,'section-menu-inventory.json'),JSON.stringify(inventory));
const currentDesign = { templateId: 'custom', backgroundColor: '#ffffff', textColor: '#20221f', accentColor: '#20221f', headerColor: '#ffffff', surfaceColor: '#ffffff', fontStyle: 'sans', layout: 'list', showImages: false, visualStyle: 'classic', decoration: 'none', sectionColumns: 1 };
suggestInventoryMenu(inventory, { menuName: 'The Kitchen', brief: 'Create a modern photo-led editorial restaurant menu. Suggest images for Main Course, Appetizers and Drinks, two columns, cream paper, dark text and warm burnt orange accents. No extra welcome heading or generic tagline.', existingSections: ['Main Course','Appetizers','Drinks'], includeDeals: false, includeStyle: true, includeSectionImages: true, currentDesign, brand: { name: 'The Kitchen', theme: '', logo: '', colors: [] } }).then(result=>{fs.writeFileSync(path.resolve(__dirname,'section-menu-suggestions.json'),JSON.stringify(result));console.log(JSON.stringify({style:result.style,sections:result.sections.map(({name,imageKey})=>({name,imageKey}))}));}).catch(error=>{console.error(error.message);process.exitCode=1;});
