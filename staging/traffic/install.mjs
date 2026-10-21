import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingConfigProblem } from './policy.mjs';

// Run ONLY against a generated, already-isolated test output directory, never the source tree.
export async function installTraffic(outputDirectory, config) {
  const problem = stagingConfigProblem(config);
  if (problem || !config.publishableKey || !/^nwtb_test_[a-z0-9_]+$/.test(config.officeTokenKey || '')) throw Error(problem || 'Separate test publishable key and storage namespace required.');
  const output = resolve(outputDirectory), source = dirname(fileURLToPath(import.meta.url));
  if ([resolve(source, '../..'), resolve(source, '..')].includes(output)) throw Error('Use a generated test output directory, not app source.');
  const manifest = JSON.parse(await readFile(join(output, '.nwtb-staging.json'), 'utf8'));
  if (manifest.environment !== 'STAGING' || manifest.projectRef !== config.projectRef || manifest.siteOrigin !== config.siteOrigin) throw Error('Generated test build identity does not match configuration.');
  async function audit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Test build cannot contain symbolic links.');
      if (entry.isDirectory()) { await audit(path); continue; }
      if (!/\.(html|js|mjs|json|webmanifest|svg)$/.test(entry.name)) continue;
      const text = await readFile(path, 'utf8');
      for (const host of text.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g)) if (host[1] !== config.projectRef) throw Error('A non-test Supabase connection remains in the generated build.');
      if (/https:\/\/(?:raw\.githubusercontent\.com\/billyjwiorek-tech\/nwtb-route-creator|billyjwiorek-tech\.github\.io\/nwtb-route-creator)/.test(text)) throw Error('A live app or remote legacy page remains in the generated build.');
    }
  }
  await audit(output);
  const page = join(output, 'tracker-live-core.html'); let html = await readFile(page, 'utf8');
  if (html.includes('document.write(') || !html.includes('__nwtbTrackerMap')) throw Error('Vendor the pinned tracker and expose its existing map before adding traffic.');
  if (html.includes('nwtb-staging-traffic-config')) throw Error('Traffic is already installed; rebuild from the pinned base first.');
  const client = join(output, 'nwtb-test-traffic'); await mkdir(client, { recursive: true });
  for (const name of ['frontend.mjs', 'policy.mjs']) await copyFile(join(source, name), join(client, name));
  // JSON is escaped for an inline script context; this contains only public test configuration.
  const publicConfig = { environment: 'STAGING', projectRef: config.projectRef, backendUrl: config.backendUrl, siteOrigin: config.siteOrigin, publishableKey: config.publishableKey, officeTokenKey: config.officeTokenKey };
  const value = JSON.stringify(publicConfig).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = '<script id="nwtb-staging-traffic-config">window.NWTB_STAGING_CONFIG=' + value + ';</script><script type="module" src="nwtb-test-traffic/frontend.mjs"></script>';
  if (!html.includes('</body>')) throw Error('Tracker has no closing body.');
  html = html.replace('</body>', script + '</body>'); await writeFile(page, html);
  return { tracker: page, environment: 'STAGING', projectRef: config.projectRef };
}
