import type { DescMethod, JsonValue } from '@bufbuild/protobuf';
import type { GenerateOptions } from './types.js';

export interface Snippet { label: string; language: string; code: string }
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export function examplesFor(method: DescMethod, request: JsonValue | undefined, config: GenerateOptions): Snippet[] {
  if (config.baseUrl === undefined || request === undefined || (method.methodKind !== 'unary' && method.methodKind !== 'server_streaming')) return [];
  const json = JSON.stringify(request, null, 2);
  const result: Snippet[] = [];
  const url = `${config.baseUrl.replace(/\/$/, '')}/${method.parent.typeName}/${method.name}`;
  if (method.methodKind === 'unary') {
    result.push({ label: 'HTTP / JSON', language: 'sh', code:
      `curl --fail-with-body \\\n  --header 'Content-Type: application/json' \\\n  --header 'Connect-Protocol-Version: 1' \\\n  --data ${quote(json)} \\\n  ${quote(url)}` });
  }
  if (config.typescript) {
    const moduleFor = (file: string) => JSON.stringify(config.typescript!.module.replaceAll('{file}', file));
    const call = method.methodKind === 'unary'
      ? `const response = await client.${method.localName}(request);\nconsole.log(toJson(OutputSchema, response));`
      : `for await (const event of client.${method.localName}(request)) {\n  console.log(toJson(OutputSchema, event));\n}`;
    result.push({ label: 'TypeScript', language: 'ts', code:
      `import { fromJson, toJson } from '@bufbuild/protobuf';\nimport { createClient } from '@connectrpc/connect';\nimport { createConnectTransport } from '@connectrpc/connect-node';\nimport { ${method.parent.name} } from ${moduleFor(method.parent.file.name)};\nimport { ${nestedGoName(method.input)}Schema as InputSchema } from ${moduleFor(method.input.file.name)};\nimport { ${nestedGoName(method.output)}Schema as OutputSchema } from ${moduleFor(method.output.file.name)};\n\nconst client = createClient(${method.parent.name}, createConnectTransport({\n  baseUrl: ${JSON.stringify(config.baseUrl)},\n  httpVersion: '1.1',\n}));\nconst request = fromJson(InputSchema, ${json});\n\n${call}` });
  }
  if (config.go) {
    const inputName = nestedGoName(method.input);
    const stream = method.methodKind === 'server_streaming';
    const call = stream
      ? `stream, err := client.${method.name}(context.Background(), connect.NewRequest(request))\n\tif err != nil { log.Fatal(err) }\n\tdefer stream.Close()\n\tfor stream.Receive() {\n\t\tdata, err := protojson.Marshal(stream.Msg())\n\t\tif err != nil { log.Fatal(err) }\n\t\tfmt.Println(string(data))\n\t}\n\tif err := stream.Err(); err != nil { log.Fatal(err) }`
      : `response, err := client.${method.name}(context.Background(), connect.NewRequest(request))\n\tif err != nil { log.Fatal(err) }\n\tdata, err := protojson.Marshal(response.Msg)\n\tif err != nil { log.Fatal(err) }\n\tfmt.Println(string(data))`;
    result.push({ label: 'Go', language: 'go', code:
      `package main\n\nimport (\n\t"context"\n\t"fmt"\n\t"log"\n\t"net/http"\n\t"connectrpc.com/connect"\n\t"google.golang.org/protobuf/encoding/protojson"\n\tpb ${JSON.stringify(config.go.messageImport)}\n\trpc ${JSON.stringify(config.go.connectImport)}\n)\n\nfunc main() {\n\tclient := rpc.New${method.parent.name}Client(http.DefaultClient, ${JSON.stringify(config.baseUrl)})\n\trequest := new(pb.${inputName})\n\tif err := protojson.Unmarshal([]byte(${JSON.stringify(json)}), request); err != nil { log.Fatal(err) }\n\t${call}\n}` });
  }
  if (config.grpc && method.methodKind === 'unary') {
    const base = new URL(config.baseUrl);
    result.push({ label: 'gRPC', language: 'sh', code: `grpcurl ${base.protocol === 'http:' ? '-plaintext ' : ''}-protoset schema.binpb \\\n  -d ${quote(json)} \\\n  ${quote(base.host)} ${quote(`${method.parent.typeName}/${method.name}`)}` });
  }
  return result;
}

function nestedGoName(message: DescMethod['input']): string {
  return message.parent ? `${nestedGoName(message.parent)}_${message.name}` : message.name;
}
