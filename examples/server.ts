import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { fromJson } from "@bufbuild/protobuf";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { ShipmentService, GetShipmentResponseSchema, ShipmentEventSchema } from "./gen/shipping/v1/shipping_pb.js";
import { parseExamples } from "../src/input.js";

async function loadExamples() {
  const examples = parseExamples(await readFile(new URL("./examples.json", import.meta.url), "utf8"));
  const shipment = examples["shipping.v1.ShipmentService.GetShipment"]?.response;
  const events = examples["shipping.v1.ShipmentService.WatchShipment"]?.responses;
  if (shipment === undefined || events === undefined) throw new Error("Missing shipment fixture examples.");
  return { shipment, events };
}

const { shipment, events } = await loadExamples();

export function routes(router: ConnectRouter) {
  router.service(ShipmentService, {
    getShipment(request) {
      if (request.shipmentId === "") throw new ConnectError("shipment_id is required", Code.InvalidArgument);
      return fromJson(GetShipmentResponseSchema, shipment);
    },
    watchShipment(request) {
      if (request.shipmentId === "") throw new ConnectError("shipment_id is required", Code.InvalidArgument);
      return Readable.from(events.map((event) => fromJson(ShipmentEventSchema, event)));
    },
    async uploadEvents(requests) {
      let accepted = 0;
      for await (const request of requests) if (request.shipmentId !== "") accepted++;
      return { accepted };
    },
    async *syncEvents(requests) {
      for await (const request of requests) yield request;
    },
  });
}

export function fixtureServer() {
  return createServer(connectNodeAdapter({ routes }));
}

const executable = process.argv[1];
if (executable !== undefined && import.meta.url === pathToFileURL(executable).href) {
  const server = fixtureServer();
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Shipping fixture listening at http://127.0.0.1:${port}`);
  });
}
