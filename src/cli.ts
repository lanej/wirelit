#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { generate } from './index.js';
import type { WirelitConfig } from './types.js';

const help = `Wirelit 0.1.0 — Connect API documentation as ordinary MDX

Usage: wirelit generate --config wirelit.json
       wirelit generate --schema schema.binpb --out src/content/docs/reference/api --mount /reference/api/ --base-url https://api.example.com

Options:
  --config PATH       JSON configuration; paths resolve relative to this file
  --schema PATH       Binary FileDescriptorSet (include imports and source info)
  --out PATH          Dedicated generated MDX directory
  --mount PATH        Public URL path for the generated directory
  --base-url URL      Connect server base URL
  --help              Show this help
  --version           Show the generator version
`;

try {
  const { values, positionals } = parseArgs({ options: {
    config: { type: 'string' }, schema: { type: 'string' }, out: { type: 'string' }, mount: { type: 'string' },
    'base-url': { type: 'string' }, help: { type: 'boolean' }, version: { type: 'boolean' },
  }, allowPositionals: true });
  if (values.help || !positionals.length && !values.version) console.log(help);
  else if (values.version) console.log('0.1.0');
  else {
    if (positionals.length !== 1 || positionals[0] !== 'generate') throw new Error('Expected the generate command. Use --help for usage.');
    const configPath = values.config ? resolve(values.config) : undefined;
    const base = configPath ? dirname(configPath) : process.cwd();
    const config: WirelitConfig = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : {};
    const allowed = new Set(['schema', 'out', 'mount', 'baseUrl', 'title', 'services', 'protocolGuide', 'sourceVersion', 'examples', 'grpc', 'typescript', 'go']);
    for (const key of Object.keys(config)) if (!allowed.has(key)) throw new Error(`Unknown configuration option: ${key}`);
    for (const key of ['schema', 'out', 'mount'] as const) if (values[key]) config[key] = values[key]!;
    if (values['base-url']) config.baseUrl = values['base-url'];
    if (typeof config.schema !== 'string' || !config.schema) throw new Error('A schema path is required.');
    if (typeof config.out !== 'string' || !config.out) throw new Error('An output directory is required.');
    const result = await generate({ ...config,
      out: resolve(base, config.out),
      schema: await readFile(resolve(base, config.schema)),
      examples: config.examples ? JSON.parse(await readFile(resolve(base, config.examples), 'utf8')) : undefined,
    });
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    console.log(`Wirelit: ${result.written.length} written, ${result.unchanged.length} unchanged, ${result.removed.length} removed.`);
  }
} catch (e) {
  console.error(`wirelit: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
