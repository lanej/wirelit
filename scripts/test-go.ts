import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fixtureServer } from '../examples/server.js';
import { readSchema } from '../src/schema.js';
import { render } from '../src/render.js';
import { examplesFor } from '../src/snippets.js';

const config = JSON.parse(await readFile(new URL('../examples/wirelit.json', import.meta.url), 'utf8'));
const schema = await readFile(new URL('../examples/schema.binpb', import.meta.url));
const examples = JSON.parse(await readFile(new URL('../examples/examples.json', import.meta.url), 'utf8'));
const model = readSchema(schema);
const server = fixtureServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
config.baseUrl = `http://127.0.0.1:${address.port}`;
const options = { ...config, schema, examples };
const pages = render(model, options).pages;
const exec = promisify(execFile);
try {
  for (const method of model.services[0]!.methods.filter(m => m.methodKind === 'unary' || m.methodKind === 'server_streaming')) {
    const example = examples[`shipping.v1.ShipmentService.${method.name}`];
    const snippet = examplesFor(method, example.request, options).find(s => s.language === 'go')!;
    assert.ok(pages.get(`services/shipping-v1-shipmentservice/${method.name.toLowerCase()}.mdx`)!.includes(snippet.code));
    const dir = await mkdtemp(new URL('../examples/go/wirelit-snippet-', import.meta.url).pathname);
    try {
      await writeFile(join(dir, 'main.go'), snippet.code);
      const { stdout } = await exec('go', ['run', './' + dir.split('/').at(-1)], { cwd: new URL('../examples/go/', import.meta.url).pathname, timeout: 120_000 });
      const values = stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(values, method.methodKind === 'unary' ? [example.response] : example.responses);
      console.log(`Go ${method.name}: compiled, ran, and matched the documented JSON.`);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
