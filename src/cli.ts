#!/usr/bin/env node
import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { generate } from "./index.js";
import { parseConfig, parseExamples } from "./input.js";

const help = `Wirelit 0.1.0 — Connect API documentation as ordinary MDX

Usage: wirelit generate --config wirelit.json
       wirelit generate --schema schema.binpb --out src/content/docs/reference/api --mount /reference/api/ --base-url https://api.example.com

Options:
  --config PATH       JSON configuration; paths resolve relative to this file
  --schema PATH       Binary FileDescriptorSet (include imports and source info)
  --out PATH          Dedicated generated MDX directory
  --mount PATH        Public URL path for the generated directory
  --base-url URL      Connect server base URL (optional; omit for non-public transports)
  --help              Show this help
  --version           Show the generator version
`;

try {
  const { values, positionals } = parseArgs({
    options: {
      config: { type: "string" },
      schema: { type: "string" },
      out: { type: "string" },
      mount: { type: "string" },
      "base-url": { type: "string" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  if (values.help || (positionals.length === 0 && !values.version)) console.log(help);
  else if (values.version) console.log("0.1.0");
  else {
    if (positionals.length !== 1 || positionals[0] !== "generate")
      throw new Error("Expected the generate command. Use --help for usage.");
    const configPath = values.config ?? "";
    const base = configPath === "" ? process.cwd() : dirname(resolve(configPath));
    const config = configPath === "" ? {} : parseConfig(await readFile(configPath, "utf8"));
    for (const key of ["schema", "out", "mount"] as const) {
      const override = values[key] ?? "";
      if (override !== "") config[key] = override;
    }
    const baseUrl = values["base-url"] ?? "";
    if (baseUrl !== "") config.baseUrl = baseUrl;
    const { schema, out, mount, examples: exampleFile = "", ...options } = config;
    if (schema === undefined || schema === "") throw new Error("A schema path is required.");
    if (out === undefined || out === "") throw new Error("An output directory is required.");
    const result = await generate({
      ...options,
      mount: mount ?? "",
      out: resolve(base, out),
      schema: await readFile(resolve(base, schema)),
      examples: exampleFile === "" ? undefined : parseExamples(await readFile(resolve(base, exampleFile), "utf8")),
    });
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    console.log(
      `Wirelit: ${result.written.length} written, ${result.unchanged.length} unchanged, ${result.removed.length} removed.`,
    );
  }
} catch (e) {
  console.error(`wirelit: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
