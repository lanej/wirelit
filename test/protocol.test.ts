import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { toJson } from "@bufbuild/protobuf";
import { fixtureServer } from "../examples/server.js";
import { ShipmentService, GetShipmentResponseSchema } from "../examples/gen/shipping/v1/shipping_pb.js";
import { readSchema, render, type GenerateOptions } from "../src/index.js";
import { isRecord, parseExamples } from "../src/input.js";
import { examplesFor } from "../src/snippets.js";

const server = fixtureServer();
let baseUrl: string;
before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    }),
);
const execute = promisify(execFile);
const examples = parseExamples(await readFile(new URL("../examples/examples.json", import.meta.url), "utf8"));

const protocolTest = test("HTTP JSON, binary Connect, and streaming use the documented contract", async () => {
  const path = `${baseUrl}/shipping.v1.ShipmentService/GetShipment`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
    body: JSON.stringify({ shipmentId: "shp_123" }),
  });
  assert.equal(response.status, 200);
  const expected = examples["shipping.v1.ShipmentService.GetShipment"]?.response;
  assert.notEqual(expected, undefined);
  assert.deepEqual(await response.json(), expected);
  const client = createClient(
    ShipmentService,
    createConnectTransport({ baseUrl, httpVersion: "1.1", useBinaryFormat: true }),
  );
  assert.deepEqual(toJson(GetShipmentResponseSchema, await client.getShipment({ shipmentId: "shp_123" })), expected);
  const events = [];
  for await (const event of client.watchShipment({ shipmentId: "shp_123" })) events.push(event.sequence);
  assert.deepEqual(events, [1n, 2n]);
  const error = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(error.status, 400);
  const errorBody: unknown = await error.json();
  assert.ok(isRecord(errorBody));
  assert.equal(errorBody["code"], "invalid_argument");
});

const snippetTest =
  test("generated curl and TypeScript examples execute unchanged against a real server", async (t) => {
    const schema = await readFile(new URL("../examples/schema.binpb", import.meta.url));
    const model = readSchema(schema);
    const config: GenerateOptions = {
      schema,
      out: "/unused",
      mount: "/reference/api/",
      baseUrl,
      examples,
      typescript: { module: "./gen/{file}_pb.js" },
    };
    const rendered = render(model, config);
    const service = model.services[0];
    assert.ok(service);
    for (const method of service.methods.filter(
      (m) => m.methodKind === "unary" || m.methodKind === "server_streaming",
    )) {
      const snippets = examplesFor(method, examples[`shipping.v1.ShipmentService.${method.name}`]?.request, config);
      const page = rendered.pages.get(`services/shipping-v1-shipmentservice/${method.name.toLowerCase()}.mdx`);
      assert.ok(page !== undefined);
      assert.ok(snippets.length > 0);
      for (const snippet of snippets) {
        assert.ok(page.includes(snippet.code));
        if (snippet.language === "sh") {
          const { stdout } = await execute("sh", ["-c", snippet.code]);
          const value: unknown = JSON.parse(stdout);
          assert.ok(isRecord(value) && isRecord(value["shipment"]));
          assert.equal(value["shipment"]["shipmentId"], "shp_123");
        } else if (snippet.language === "ts") {
          const path = new URL(`../examples/.wirelit-snippet-${method.name}.ts`, import.meta.url);
          t.after(() => rm(path, { force: true }));
          await writeFile(path, snippet.code);
          const { stdout } = await execute(process.execPath, ["--import", "tsx", path.pathname]);
          assert.ok(stdout.includes(method.methodKind === "unary" ? "shp_123" : "SHIPMENT_STATUS_DELIVERED"));
        }
      }
    }
  });

await Promise.all([protocolTest, snippetTest]);
