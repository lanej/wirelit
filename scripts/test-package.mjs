import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'wirelit-consumer-'));
const root = new URL('../', import.meta.url).pathname;
try {
  const { stdout } = await exec('npm', ['pack', '--json', '--pack-destination', dir], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  const [pack] = JSON.parse(stdout);
  await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', join(dir, pack.filename)], { cwd: dir, maxBuffer: 4 * 1024 * 1024 });
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs/guide.mdx'), 'Authored guide');
  const args = [join(dir, 'node_modules/@lanej/wirelit/dist/cli.js'), 'generate', '--schema', join(root, 'examples/schema.binpb'), '--out', join(dir, 'docs/reference/api'), '--mount', '/reference/api/', '--base-url', 'https://api.example.com'];
  await exec(process.execPath, args, { cwd: dir });
  const second = await exec(process.execPath, args, { cwd: dir });
  assert.match(second.stdout, /0 written/);
  assert.equal(await readFile(join(dir, 'docs/guide.mdx'), 'utf8'), 'Authored guide');
  const generated = await readFile(join(dir, 'docs/reference/api/types/shipping-v1-shipment.mdx'), 'utf8');
  assert.match(generated, /JSON name \| `shipmentId`/);
  assert.ok(!generated.includes('@lanej/wirelit'));
  await exec(process.execPath, ['--input-type=module', '-e', "import { generate } from '@lanej/wirelit'; if(typeof generate !== 'function') throw Error('missing export')"], { cwd: dir });
  console.log('Packed package installs in a clean consumer, exports its API, and generates independent MDX.');
} finally { await rm(dir, { recursive: true, force: true }); }
