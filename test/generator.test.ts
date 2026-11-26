import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, mkdir, readdir, symlink, rm, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import { generate, readSchema, render, type GenerateOptions } from "../src/index.js";
import { parseExamples } from "../src/input.js";
import { markdown } from "../src/markdown.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { mdxjs } from "micromark-extension-mdxjs";

const schema = await readFile(new URL("../examples/schema.binpb", import.meta.url));
const examples = parseExamples(await readFile(new URL("../examples/examples.json", import.meta.url), "utf8"));
const options = (out: string): GenerateOptions => ({
  schema,
  out,
  examples,
  mount: "/docs/reference/api/",
  baseUrl: "https://api.example.com",
  typescript: { module: "./gen/{file}_pb.js" },
});
const temp = async (t: { after: (fn: () => Promise<void>) => void }) => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), "wirelit-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};
const shipment = "types/shipping-v1-shipment.mdx";
const method = "services/shipping-v1-shipmentservice/getshipment.mdx";

function rpcContract(page: string): string {
  const section = page.split("## RPC contract")[1]?.split("## Connect endpoint")[0];
  assert.ok(section !== undefined, "Expected an RPC contract section");
  return section;
}

await test("generates complete MDX for the complex contract and all four RPC shapes", async (t) => {
  const out = await temp(t);
  const result = await generate(options(out));
  assert.ok(result.written.length >= 22);
  const text = await readFile(join(out, shipment), "utf8");
  assert.match(text, /### id[\s\S]*JSON name \| `shipmentId`/);
  assert.match(text, /### weight_mg[\s\S]*Decimal string/);
  assert.match(text, /member of oneof `destination`/);
  assert.match(text, /map of `string` to \[CurrencyAmount\]/);
  assert.match(text, /Deprecated/);
  assert.ok(result.written.includes("types/shipping-v1-shipment-insurance-coverage.mdx"));
  const unary = await readFile(join(out, method), "utf8");
  assert.match(unary, /curl --fail-with-body/);
  assert.match(unary, /"weightMg": "450000"/);
  assert.match(unary, /\/docs\/reference\/api\/types\/shipping-v1-getshipmentrequest\//);
  assert.match(unary, /No side effects/);
  const contract = rpcContract(unary);
  assert.equal((contract.match(/GetShipmentRequest<\/a>/g) ?? []).length, 1);
  assert.equal((contract.match(/GetShipmentResponse<\/a>/g) ?? []).length, 1);
  assert.match(contract, /title="shipping.v1.GetShipmentRequest"/);
  assert.ok(!contract.includes("Request:"));
  for (const [name, shape] of [
    ["watchshipment", "Server streaming"],
    ["uploadevents", "Client streaming"],
    ["syncevents", "Bidirectional streaming"],
  ] as const) {
    const page = await readFile(join(out, `services/shipping-v1-shipmentservice/${name}.mdx`), "utf8");
    assert.ok(page.includes(shape));
    assert.ok(page.includes("application/connect+json"));
    assert.ok(!page.includes("curl --fail-with-body"));
    const signature = rpcContract(page);
    assert.equal(
      signature.split("<strong>returns</strong>")[0]?.includes("(<strong>stream</strong> <a"),
      name !== "watchshipment",
    );
    assert.equal(signature.includes("<strong>returns</strong> (<strong>stream</strong> <a"), name !== "uploadevents");
  }
});

await test("generation is deterministic and preserves authored pages and unchanged timestamps", async (t) => {
  const out = await temp(t);
  await writeFile(join(out, "guide.mdx"), "Handwritten guide");
  await generate(options(out));
  const before = await stat(join(out, shipment));
  const repeat = await generate(options(out));
  assert.equal(repeat.written.length, 0);
  assert.equal(repeat.removed.length, 0);
  assert.equal((await stat(join(out, shipment))).mtimeMs, before.mtimeMs);
  assert.equal(await readFile(join(out, "guide.mdx"), "utf8"), "Handwritten guide");
});

await test("preflights authored-file conflicts before writing other generated pages", async (t) => {
  const out = await temp(t);
  await mkdir(join(out, "types"), { recursive: true });
  await writeFile(join(out, shipment), "Authored");
  await assert.rejects(generate(options(out)), /Refusing to overwrite authored file/);
  assert.deepEqual((await readdir(out)).sort(), ["types"]);
  assert.equal(await readFile(join(out, shipment), "utf8"), "Authored");
});

await test("refuses to discard edits to owned generated files", async (t) => {
  const out = await temp(t);
  await generate(options(out));
  await writeFile(join(out, shipment), "User added context");
  await assert.rejects(generate(options(out)), /Generated file was edited/);
  assert.equal(await readFile(join(out, shipment), "utf8"), "User added context");
});

await test("removes stale owned pages after a schema change, preserving authored files", async (t) => {
  const out = await temp(t);
  await generate(options(out));
  await writeFile(join(out, "guide.mdx"), "Keep this");
  const set = fromBinary(FileDescriptorSetSchema, schema);
  const service = set.file.find((file) => file.package === "shipping.v1" && file.service.length > 0)?.service[0];
  assert.ok(service);
  service.method = service.method.filter((method) => method.name !== "SyncEvents");
  const result = await generate({ ...options(out), schema: toBinary(FileDescriptorSetSchema, set) });
  assert.ok(result.removed.includes("services/shipping-v1-shipmentservice/syncevents.mdx"));
  await assert.rejects(readFile(join(out, "services/shipping-v1-shipmentservice/syncevents.mdx")), { code: "ENOENT" });
  assert.equal(await readFile(join(out, "guide.mdx"), "utf8"), "Keep this");
});

await test("rejects invalid JSON examples and unknown method examples before generating files", async (t) => {
  const out = await temp(t);
  const invalid = { "shipping.v1.ShipmentService.GetShipment": { request: { unknownField: true } } };
  await assert.rejects(generate({ ...options(out), examples: invalid }), /Invalid .* request/);
  await assert.rejects(generate({ ...options(out), examples: { missing: { request: {} } } }), /unknown method/);
  assert.deepEqual(await readdir(out), []);
});

await test("uses ProtoJSON conversion for exact integers, bytes, timestamps, oneofs, and Any", () => {
  const model = readSchema(schema);
  const type = model.registry.getMessage("shipping.v1.Shipment");
  assert.ok(type);
  const invalid = {
    "shipping.v1.ShipmentService.GetShipment": {
      request: {},
      response: { shipment: { streetAddress: "x", pickupPoint: "y" } },
    },
  };
  assert.throws(
    () => render(model, { ...options("/unused"), examples: invalid }),
    /cannot set multiple oneof fields|oneof/i,
  );
  const valid = {
    "shipping.v1.ShipmentService.GetShipment": {
      request: {},
      response: {
        shipment: {
          weightMg: "18446744073709551615",
          proofOfDelivery: "YWJj",
          createdAt: "2026-01-01T00:00:00Z",
          carrierDetails: {
            "@type": "type.googleapis.com/shipping.v1.CurrencyAmount",
            currency: "USD",
            minorUnits: "9007199254740993",
          },
        },
      },
    },
  };
  const page = render(model, { ...options("/unused"), examples: valid }).pages.get(method);
  assert.ok(page !== undefined);
  assert.ok(page.includes('"18446744073709551615"'));
  assert.ok(page.includes('"9007199254740993"'));
  assert.ok(page.includes('"YWJj"'));
  assert.ok(type.fields.length > 10);
});

await test("treats comments as Markdown text, preserving code and links without MDX execution", () => {
  const result = markdown(
    'import fs from "node:fs";\n\nA {value} and <Widget />.\n\n`{safe}` and [guide](/guides/).\n\n```js\nconst x = { id: 1 };\n```',
  );
  assert.ok(!result.startsWith("import "));
  const tree = fromMarkdown(result, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] });
  function inspect(node: typeof tree | (typeof tree.children)[number]) {
    assert.ok(!node.type.startsWith("mdx"), `Unexpected executable MDX node: ${node.type}`);
    if ("children" in node) for (const child of node.children) inspect(child);
  }
  inspect(tree);
  assert.match(result, /`\{safe\}`/);
  assert.match(result, /const x = \{ id: 1 \};/);
  assert.match(result, /\[guide\]\(\/guides\/\)/);
});

await test("rejects symlink output and traversal in ownership manifests", async (t) => {
  const root = await temp(t);
  const real = join(root, "real");
  await mkdir(real);
  const link = join(root, "link");
  await symlink(real, link);
  await assert.rejects(generate(options(link)), /symbolic link/);
  await writeFile(
    join(real, ".wirelit-manifest.json"),
    JSON.stringify({ version: 1, files: { "../outside.mdx": "0".repeat(64) } }),
  );
  await assert.rejects(generate(options(real)), /escapes output directory/);
});

await test("reports missing source information and refuses unknown service names", () => {
  const set = fromBinary(FileDescriptorSetSchema, schema);
  for (const file of set.file) file.sourceCodeInfo = undefined;
  assert.ok(readSchema(toBinary(FileDescriptorSetSchema, set)).warnings.length > 0);
  assert.throws(() => readSchema(schema, ["absent.Service"]), /Service not found/);
});

await test("omitting baseUrl documents path-only endpoints without client snippets", async (t) => {
  const out = await temp(t);
  const rest = { ...options(out), baseUrl: undefined, typescript: undefined };
  await generate({ ...rest, transportNote: "Reached only through a **loopback** forward with bearer authentication." });
  const text = await readFile(join(out, method), "utf8");
  assert.match(text, /POST \/shipping\.v1\.ShipmentService\/GetShipment/);
  assert.doesNotMatch(text, /curl|https:\/\/api\.example\.com|Calling this method/);
  assert.match(text, /Reached only through a \*\*loopback\*\* forward/);
  assert.match(text, /"weightMg": "450000"/);
  assert.match(await readFile(join(out, "index.mdx"), "utf8"), /Generator: `Wirelit/);
  assert.doesNotMatch(await readFile(join(out, "index.mdx"), "utf8"), /unspecified/);
  await assert.rejects(generate({ ...rest, out, typescript: { module: "./gen/{file}_pb.js" } }), /require a baseUrl/);
});
