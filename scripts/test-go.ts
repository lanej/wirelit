import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import assert from "node:assert/strict";
import { fixtureServer } from "../examples/server.js";
import { parseConfig, parseExamples } from "../src/input.js";
import { readSchema } from "../src/schema.js";
import { render } from "../src/render.js";
import { examplesFor } from "../src/snippets.js";

const config = parseConfig(await readFile(new URL("../examples/wirelit.json", import.meta.url), "utf8"));
const schema = await readFile(new URL("../examples/schema.binpb", import.meta.url));
const examples = parseExamples(await readFile(new URL("../examples/examples.json", import.meta.url), "utf8"));
const model = readSchema(schema);
const server = fixtureServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address !== null && typeof address !== "string");
const { out, mount } = config;
assert.ok(out !== undefined && out !== "");
assert.ok(mount !== undefined && mount !== "");
const options = { ...config, out, mount, baseUrl: `http://127.0.0.1:${address.port}`, schema, examples };
const pages = render(model, options).pages;
const exec = promisify(execFile);
try {
  const service = model.services[0];
  assert.ok(service);
  for (const method of service.methods.filter((m) => m.methodKind === "unary" || m.methodKind === "server_streaming")) {
    const example = examples[`shipping.v1.ShipmentService.${method.name}`];
    assert.ok(example);
    const snippet = examplesFor(method, example.request, options).find((s) => s.language === "go");
    assert.ok(snippet);
    const page = pages.get(`services/shipping-v1-shipmentservice/${method.name.toLowerCase()}.mdx`);
    assert.ok(page !== undefined && page.includes(snippet.code));
    const dir = await mkdtemp(new URL("../examples/go/wirelit-snippet-", import.meta.url).pathname);
    try {
      await writeFile(join(dir, "main.go"), snippet.code);
      const { stdout } = await exec("go", ["run", "./" + basename(dir)], {
        cwd: new URL("../examples/go/", import.meta.url).pathname,
        timeout: 120_000,
      });
      const values = stdout
        .trim()
        .split("\n")
        .map((line): unknown => JSON.parse(line));
      assert.deepEqual(values, method.methodKind === "unary" ? [example.response] : example.responses);
      console.log(`Go ${method.name}: compiled, ran, and matched the documented JSON.`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
}
