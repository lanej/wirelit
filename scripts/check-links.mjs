import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = new URL('../examples/site/dist/', import.meta.url).pathname;
const base = process.env.GITHUB_PAGES === 'true' ? '/wirelit' : '';
const pages = new Map();
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.html')) pages.set('/' + path.slice(root.length).replace(/index\.html$/, ''), await readFile(path, 'utf8'));
  }
}
await walk(root);
const failures = [];
for (const [route, html] of pages) {
  for (const [, raw] of html.matchAll(/href="([^"]+)"/g)) {
    const href = raw.replace(/&amp;/g, '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    if (base && !href.startsWith(base + '/')) { failures.push(`${route}: missing base path: ${href}`); continue; }
    const url = new URL(href.slice(base.length), 'https://example.test');
    const target = pages.get(url.pathname) ?? pages.get(url.pathname + '/');
    if (!target) {
      if (!/\.[a-z0-9]+$/i.test(url.pathname)) failures.push(`${route}: missing page ${href}`);
      continue;
    }
    if (url.hash && !target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) failures.push(`${route}: missing anchor ${href}`);
  }
}
if (failures.length) throw new Error(`${failures.length} broken links:\n${failures.slice(0, 20).join('\n')}`);
const index = await readFile(join(root, 'pagefind/pagefind-entry.json'), 'utf8').catch(() => '');
assert.ok(index.length > 0, 'Search index was generated');
console.log(`Checked links and anchors across ${pages.size} built pages; search index present.`);
