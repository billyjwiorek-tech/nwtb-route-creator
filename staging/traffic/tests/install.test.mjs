import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installTraffic } from '../install.mjs';
const config = { environment: 'STAGING', projectRef: 'abcdefghijklmnopqrst', backendUrl: 'https://abcdefghijklmnopqrst.supabase.co', siteOrigin: 'https://nwtb-test.example', publishableKey: 'fixture-public-key', officeTokenKey: 'nwtb_test_office_token' };
async function fixture(run) { const root = await mkdtemp(join(tmpdir(), 'nwtb-traffic-test-')); try { await writeFile(join(root, '.nwtb-staging.json'), JSON.stringify(config)); await writeFile(join(root, 'tracker-live-core.html'), '<html><body><div id="map"></div><script>window.__nwtbTrackerMap={};</script></body></html>'); await run(root); } finally { await rm(root, { recursive: true, force: true }); } }

test('traffic installs only into identified test output and injects module after existing map scripts', async () => fixture(async root => {
  await installTraffic(root, { ...config, TOMTOM_API_KEY: 'must-not-be-published' }); const html = await readFile(join(root, 'tracker-live-core.html'), 'utf8');
  assert.ok(html.indexOf('__nwtbTrackerMap') < html.indexOf('nwtb-staging-traffic-config')); assert.match(html, /type="module" src="nwtb-test-traffic\/frontend.mjs"/); assert.match(html, /nwtb_test_office_token/); assert.ok(!html.includes('must-not-be-published')); await assert.rejects(installTraffic(root, config), /already installed/);
}));

test('installer refuses production project, ordinary session key and remaining live connections', async () => fixture(async root => {
  await assert.rejects(installTraffic(root, { ...config, projectRef: 'ufnjyidhxuytrmbjzgtu', backendUrl: 'https://ufnjyidhxuytrmbjzgtu.supabase.co' }), /separate test project/);
  await assert.rejects(installTraffic(root, { ...config, officeTokenKey: 'nwtb_delivery_token' }), /namespace/);
  await writeFile(join(root, 'bad.js'), 'fetch("https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery")'); await assert.rejects(installTraffic(root, config), /non-test Supabase/);
}));

test('installer refuses runtime legacy download wrapper and wrong build identity', async () => fixture(async root => {
  await writeFile(join(root, 'tracker-live-core.html'), '<html><body><script>window.__nwtbTrackerMap={};document.write("legacy");</script></body></html>'); await assert.rejects(installTraffic(root, config), /Vendor the pinned tracker/);
  await writeFile(join(root, '.nwtb-staging.json'), JSON.stringify({ ...config, projectRef: 'zyxwvutsrqponmlkjihg' })); await assert.rejects(installTraffic(root, config), /identity/);
}));
