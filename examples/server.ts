import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { fromJson } from '@bufbuild/protobuf';
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { ShipmentService, GetShipmentResponseSchema, ShipmentEventSchema } from './gen/shipping/v1/shipping_pb.js';

const examples = JSON.parse(await readFile(new URL('./examples.json', import.meta.url), 'utf8'));
const prefix = 'shipping.v1.ShipmentService.';

export function routes(router: ConnectRouter) {
  router.service(ShipmentService, {
    getShipment(request) {
      if (!request.shipmentId) throw new ConnectError('shipment_id is required', Code.InvalidArgument);
      return fromJson(GetShipmentResponseSchema, examples[prefix + 'GetShipment'].response);
    },
    async *watchShipment(request) {
      if (!request.shipmentId) throw new ConnectError('shipment_id is required', Code.InvalidArgument);
      for (const event of examples[prefix + 'WatchShipment'].responses) yield fromJson(ShipmentEventSchema, event);
    },
    async uploadEvents(requests) {
      let accepted = 0;
      for await (const request of requests) if (request.shipmentId) accepted++;
      return { accepted };
    },
    async *syncEvents(requests) { for await (const request of requests) yield request; },
  });
}

export function fixtureServer() {
  return createServer(connectNodeAdapter({ routes }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = fixtureServer();
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, '127.0.0.1', () => console.log(`Shipping fixture listening at http://127.0.0.1:${port}`));
}
