# Wirelit

Generate Connect API reference documentation as ordinary MDX files for an existing Astro Starlight site.

**[Documentation and complex example](https://lanej.io/wirelit/)** · [Sample schema](examples/proto/shipping/v1/shipping.proto)

Wirelit documents the Protobuf RPC contract and its Connect HTTP/JSON representation together. Your guides, application documentation, and generated reference share the same navigation, search, theme, and deployment.

## What it generates

- Service overviews and method pages with Protobuf signatures and streaming shapes.
- Linked message and enum references with comments, field names, JSON names, numbers, presence, oneofs, and deprecations.
- Curated JSON request and response examples normalized with the actual Protobuf serializer.
- Executable curl, TypeScript (Node), and Go examples for unary and server-streaming methods when configured.
- Accurate contract pages for client and bidirectional streaming, with explicit labels when runnable examples are absent.
- Declared Protovalidate field rules when the descriptor set includes those option definitions. Rendering rules does not execute validation.

The output contains actual prose, Markdown tables, headings, code fences, and standard Starlight tabs. It needs no Wirelit runtime, custom content collection schema, router, or reference renderer.

## Build and run

This initial version is installed from source and has not been published to npm. Use Node.js 22.12 or newer.

```sh
npm ci
npm run build

node dist/cli.js generate \
  --schema schema.binpb \
  --out docs/src/content/docs/reference/api \
  --mount /reference/api/ \
  --base-url https://api.example.com
```

Compile a **FileDescriptorSet including dependencies and source information**:

```sh
buf build --as-file-descriptor-set -o schema.binpb

# Or:
protoc --include_imports --include_source_info \
  --descriptor_set_out=schema.binpb \
  --proto_path=proto proto/shipping/v1/shipping.proto
```

Wirelit reports missing comments when source information is absent. The installed CLI supports `--help` and `--version`.

## Fit into an existing Starlight site

Generate before the site's normal build. Add a reference group to the site's existing sidebar (Starlight 0.39+):

```js
{
  label: 'API reference',
  items: [{ autogenerate: { directory: 'reference/api' } }],
}
```

| Files | Owner |
| --- | --- |
| `src/content/docs/guides/*.mdx` | Authored application guides |
| `src/content/docs/reference/api/**/*.mdx` | Generated API reference |
| `astro.config.mjs` and `src/content.config.ts` | The host site |

`mount` is the public URL of the generated subtree. Include a host base path when needed, or let a host Markdown link transformer apply it consistently. The example site exercises GitHub Pages' `/wirelit/` base path this way. Keep authored and generated links consistent with the same convention.

Use normal Markdown links between guides and generated method or field anchors. Each page has a stable path based on its qualified Protobuf name (dots become hyphens). Changing a symbol's name changes its path. Case-folding collisions fail generation.

## Configuration and examples

```json
{
  "schema": "schema.binpb",
  "out": "docs/src/content/docs/reference/api",
  "mount": "/reference/api/",
  "baseUrl": "https://api.example.com",
  "title": "Shipping API",
  "services": ["shipping.v1.ShipmentService"],
  "sourceVersion": "v1.0.0",
  "protocolGuide": "/protocol/connect/",
  "examples": "examples.json",
  "typescript": { "module": "./gen/{file}_pb.js" },
  "go": {
    "messageImport": "example.com/project/gen/shipping/v1",
    "connectImport": "example.com/project/gen/shipping/v1/shippingv1connect"
  }
}
```

```sh
node dist/cli.js generate --config wirelit.json
```

Paths resolve relative to the configuration file; CLI path overrides follow the same rule. `{file}` in the TypeScript module path expands to the descriptor's source path without `.proto`. For example, `shipping/v1/shipping` becomes `./gen/shipping/v1/shipping_pb.js`. Nested message schema exports are handled; imported input/output types use their defining files. TypeScript snippets target Protobuf-ES v2 and Connect v2; Go snippets target Connect-Go v1.

Examples are keyed by `package.Service.Method`:

```json
{
  "shipping.v1.ShipmentService.GetShipment": {
    "request": { "shipmentId": "shp_123" },
    "response": { "shipment": { "shipmentId": "shp_123", "weightMg": "450000" } },
    "notes": "See the application guide for authorization requirements.",
    "errors": [{ "code": "not_found", "message": "No shipment matches the identifier." }]
  }
}
```

Use `responses` for a server stream, containing the individual decoded messages. A single `request` example is currently supported only for unary and server-streaming methods. Include SDK configuration to emit client examples. Set `grpc: true` only when the actual deployment exposes gRPC; grpcurl examples require the matching descriptor set.

Example parsing rejects unknown fields and invalid oneofs, and normalizes JSON names, 64-bit numbers, bytes, enums, timestamps, durations, Any, and other well-known types. It does not enforce Protovalidate or application business rules. Supply meaningful examples, authentication explanations, and error semantics rather than inferring them from field names.

The `go` import configuration applies to the request message and Connect client packages of every selected method. Run separate generation configurations for services requiring different Go package mappings. TypeScript supports per-file module paths through `{file}`.

## Safe regeneration

Wirelit records generated file hashes in `.wirelit-manifest.json`. It checks the entire change set for conflicts before replacing or pruning files, skips unchanged content, and removes only stale owned pages. It refuses unowned files, edited generated files, invalid manifest paths, and symlinks. Authored files and site configuration remain under your control.

Writes are atomic per file, not a filesystem-wide transaction. Run a single generator process per output directory, preserve the ownership manifest, and keep custom edits in authored guides or source comments.

## Develop and test

```sh
npm ci
npm run fixture          # Compile the complex sample and TypeScript clients
npm run check            # Types, tests, package build, Starlight build, links
npm run test:package     # Install the tarball into a clean consumer
npm run example:server  # Start the local Connect fixture on port 8080
npm run dev             # Open the documentation project locally
```

The complex schema includes imports, nested messages and enums, all four RPC shapes, explicit presence, oneofs, maps of messages, repeated fields, recursion, custom JSON names, deprecated fields, and well-known types.

The Go fixtures are checked in. With Go 1.26+ installed, run `npm run test:go` to compile and execute the generated Go examples against the fixture server. To regenerate Go code, install `protoc-gen-go@v1.36.12` and `protoc-gen-connect-go@v1.21.1`, then run `buf generate --template buf.gen.go.yaml`.

## Documentation deployment

The Documentation workflow builds the Wirelit CLI, compiles the complex schema, runs that CLI to generate the site's reference, builds Starlight, checks links with the `/wirelit/` base, and uploads the static site as a workflow artifact. Authored pages live under `examples/site/src/content/docs`; generated pages live in its `reference/api` subtree.

The live documentation is published at **https://lanej.io/wirelit/** by the [website repository](https://github.com/lanej/lanej.github.com). Its Pages workflow builds a pinned Wirelit commit and includes the output in the same artifact as the personal website. Update the website's `.wirelit-version` pin to publish a reviewed documentation revision. This repository does not need a separate Pages deployment. The Check workflow verifies code, output freshness, protocol examples, package installation, and the Pages base path on pull requests.

## Current boundaries

Client and bidirectional streaming have reference pages but no generated runnable snippets yet. Go package mappings are per invocation. Additional SDK languages, an interactive console, and OpenAPI export are future work. The generator uses Protobuf-ES's supported descriptor editions; unsupported or unresolved schemas fail rather than being guessed.

MIT licensed.
