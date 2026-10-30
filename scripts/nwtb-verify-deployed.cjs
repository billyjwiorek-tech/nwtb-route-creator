'use strict';
// Read-only connector evidence; never accepts a production session or performs delivery API calls.
const fs=require('node:fs'),path=require('node:path'),{digest}=require('./nwtb-release-lib.cjs');
const file=process.argv[2];if(!file)throw Error('Provide a fresh connector export containing functions, active_routes, captured_at, main_sha, pages and CI results.');
const evidence=JSON.parse(fs.readFileSync(file)),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../release/nwtb-functions.json'))),issues=[];
if(evidence.project_ref!==manifest.project_ref)issues.push('Wrong production project');
if(!Number.isFinite(Date.parse(evidence.captured_at))||Math.abs(Date.now()-Date.parse(evidence.captured_at))>300000)issues.push('Deployment evidence must be fresh (five minutes maximum)');
if(evidence.active_routes!==0)issues.push('An ACTIVE production route blocks deployment');
for(const actual of evidence.functions||[]){const slug=actual.slug||actual.name;if(!slug.includes('sales')&&!manifest.functions[slug])issues.push('Unreviewed deployed function: '+slug);}
for(const [slug,expected]of Object.entries(manifest.functions)){
 const actual=evidence.functions?.find(f=>(f.slug||f.name)===slug);if(!actual||actual.status!=='ACTIVE'||actual.version!==expected.version||actual.verify_jwt!==expected.verify_jwt){issues.push('Function status/version/auth mismatch: '+slug);continue;}
 const mapped={};for(const f of actual.files||[]){const p=f.name.startsWith('_shared/')||f.name.startsWith(slug+'/')?f.name:slug+'/'+f.name;mapped['supabase/functions/'+p]=digest(f.content);}
 if(Object.keys(mapped).length!==Object.keys(expected.files).length||Object.entries(expected.files).some(([p,h])=>mapped[p]!==h))issues.push('Deployed source differs: '+slug);
}
if(!/^[a-f0-9]{40}$/.test(evidence.main_sha||''))issues.push('Fresh main commit required');
for(const kind of ['pages','ci'])if(!evidence[kind]||evidence[kind].head_sha!==evidence.main_sha||evidence[kind].status!=='completed'||evidence[kind].conclusion!=='success')issues.push('Exact successful '+kind+' run required');
if(evidence.production_bytes_sha!==evidence.main_sha)issues.push('Production byte verification must match main');
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log('PASS: exact production sources, ACTIVE functions, no ACTIVE routes, current main, Pages, CI and public bytes.');
