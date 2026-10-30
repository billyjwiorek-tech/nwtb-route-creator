'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const {digest,roots,redirects,embedded,inventory,publicIssues,sourceInventory}=require('./nwtb-release-lib.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(read(p));
const issues=[],files=inventory(root),manifest=json('release/nwtb-client-assets.json'),functions=json('release/nwtb-functions.json');
for(const file of files){if(manifest.assets[file]!==digest(read(file)))issues.push('Client version inventory mismatch: '+file);for(const text of embedded(read(file)))for(const issue of publicIssues(text))issues.push(issue+': '+file);}
for(const file of Object.keys(manifest.assets))if(!files.includes(file))issues.push('Stale client inventory entry: '+file);
issues.push(...sourceInventory(root,functions));
for(const slug of fs.readdirSync(path.join(root,'supabase/functions')))if(slug.startsWith('nwtb-')&&!slug.includes('sales')&&fs.existsSync(path.join(root,'supabase/functions',slug,'index.ts'))&&!functions.functions[slug])issues.push('Backend function missing from reviewed inventory: '+slug);
for(const [file,target]of Object.entries(redirects)){const t=read(file);if(!t.includes(target)||!t.includes('location.replace(')||/localStorage|geolocation|fetch\(/.test(t))issues.push('Unsafe legacy entry point: '+file);}
for(const page of roots.filter(p=>p.startsWith('delivery-'))){const t=read(page);if(/<iframe[^>]+src=["']driver-(?:live|standard)\.html/.test(t))issues.push('Office embeds an authenticated Driver app: '+page);if(!t.includes('office-driver-preview.html'))issues.push('Missing Office-only view: '+page);}
for(const page of roots.filter(p=>p.startsWith('driver-'))){const t=read(page);if(/localStorage\.(?:setItem|removeItem)\(['"]nwtb_delivery_token/.test(t))issues.push('Driver changes Office identity: '+page);}
const deps=json('release/nwtb-dependencies.json');for(const entry of deps.vendored){if(digest(fs.readFileSync(path.join(root,entry.file)))!==entry.sha256)issues.push('Vendor integrity mismatch: '+entry.file);if(entry.name==='SheetJS'&&entry.version!=='0.20.3')issues.push('Unreviewed spreadsheet reader version');}
const worker=read('nwtb-driver-sw.js'),c=vm.createContext({self:{addEventListener(){}},console});vm.runInContext(worker,c);const shell=vm.runInContext('SHELL',c),hashes=vm.runInContext('SHELL_INTEGRITY',c);
for(const entry of shell){const p=entry.startsWith('./')?path.join(root,entry.slice(2).split('?')[0]):entry.startsWith('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/')?path.join(root,'tests/node_modules/leaflet/dist',entry.split('/dist/')[1].split('?')[0]):null;if(!p||!fs.existsSync(p)||digest(fs.readFileSync(p))!==hashes[entry])issues.push('Offline shell version mismatch: '+entry.split('?')[0]);}
// Parse deployed TypeScript too, without executing its handlers or reaching production.
for(const entry of Object.values(functions.functions))for(const file of Object.keys(entry.files)){try{stripTypeScriptTypes(read(file));}catch{issues.push('Invalid backend syntax: '+file);}}
if(issues.length){for(const issue of [...new Set(issues)])console.error(issue);process.exitCode=1;}else console.log('PASS: complete NWTB entry points, client/source inventories, private-credential/PIN scan, reviewed dependencies and coherent offline shell.');
