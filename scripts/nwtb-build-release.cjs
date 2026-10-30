'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{digest,inventory}=require('./nwtb-release-lib.cjs');
const root=path.resolve(__dirname,'..'),worker=path.join(root,'nwtb-driver-sw.js');
let source=fs.readFileSync(worker,'utf8');const context=vm.createContext({self:{addEventListener(){}},console});vm.runInContext(source,context);const shell=vm.runInContext('SHELL',context),hashes={};
for(const item of shell){let file;if(item.startsWith('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/'))file=path.join(root,'tests/node_modules/leaflet/dist',item.split('/dist/')[1].split('?')[0]);else if(item.startsWith('./'))file=path.join(root,item.slice(2).split('?')[0]);else throw Error('Unreviewed shell dependency');hashes[item]=digest(fs.readFileSync(file));}
source=source.replace(/const SHELL_INTEGRITY=\{[^\n]*\};/,'const SHELL_INTEGRITY='+JSON.stringify(hashes)+';');fs.writeFileSync(worker,source);
const functions=JSON.parse(fs.readFileSync(path.join(root,'release/nwtb-functions.json')));for(const entry of Object.values(functions.functions))for(const file of Object.keys(entry.files))entry.files[file]=digest(fs.readFileSync(path.join(root,file)));fs.writeFileSync(path.join(root,'release/nwtb-functions.json'),JSON.stringify(functions,null,2)+'\n');
const assets=Object.fromEntries(inventory(root).map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]));
fs.writeFileSync(path.join(root,'release/nwtb-client-assets.json'),JSON.stringify({assets},null,2)+'\n');
const vendor=JSON.parse(fs.readFileSync(path.join(root,'release/nwtb-dependencies.json')));for(const entry of vendor.vendored)entry.sha256=digest(fs.readFileSync(path.join(root,entry.file)));fs.writeFileSync(path.join(root,'release/nwtb-dependencies.json'),JSON.stringify(vendor,null,2)+'\n');
console.log('Built verified shell ('+shell.length+' resources), '+Object.keys(assets).length+' client assets and '+Object.keys(functions.functions).length+' function inventories. Review all inventory changes before release.');
