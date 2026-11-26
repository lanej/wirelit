import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isRecord } from "./input.js";
import { readSchema } from "./schema.js";
import { render } from "./render.js";
import type { GenerateOptions, GenerateResult } from "./types.js";

export type { GenerateOptions, GenerateResult, MethodExample, WirelitConfig } from "./types.js";
export { readSchema } from "./schema.js";
export { render } from "./render.js";

interface Manifest {
  version: 1;
  files: Record<string, string>;
}
const manifestName = ".wirelit-manifest.json";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  validateConfig(options);
  const model = readSchema(options.schema, options.services);
  const { pages, warnings } = render(model, options);
  const root = resolve(options.out);
  await noSymlinks(root);
  await mkdir(root, { recursive: true });
  const lock = join(root, ".wirelit.lock");
  const handle = await open(lock, "wx").catch((error: unknown) => {
    if (hasErrorCode(error, "EEXIST"))
      throw new Error(`Generation is already running, or a stale lock exists: ${lock}`);
    throw error;
  });
  const staged: string[] = [];
  try {
    await noSymlinks(join(root, manifestName));
    const raw = await readOptional(join(root, manifestName));
    const previous = readManifest(root, raw);
    const next: Manifest = { version: 1, files: {} };
    const result: GenerateResult = { written: [], removed: [], unchanged: [], warnings };
    const names = [...new Set([...pages.keys(), ...Object.keys(previous.files)])].sort();
    for (const path of names) {
      const target = safePath(root, path);
      await noSymlinks(target);
      const existing = await readOptional(target);
      const generated = pages.get(path);
      if (generated !== undefined) next.files[path] = hash(generated);
      if (existing !== undefined) {
        if (!Object.hasOwn(previous.files, path)) throw new Error(`Refusing to overwrite authored file: ${target}`);
        const current = hash(existing);
        if (current !== previous.files[path] && current !== next.files[path])
          throw new Error(
            `Generated file was edited: ${target}. Move edits to the schema, examples, or authored guides.`,
          );
      }
      if (generated === undefined) {
        if (existing !== undefined) result.removed.push(path);
      } else if (existing === generated) result.unchanged.push(path);
      else result.written.push(path);
    }
    // Complete conflict checks before modifying any existing documentation.
    for (const path of result.written) {
      const content = pages.get(path);
      if (content === undefined) throw new Error(`Missing generated content for ${path}`);
      const target = safePath(root, path);
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${randomUUID()}.tmp`;
      staged.push(temp);
      await writeFile(temp, content, { flag: "wx" });
      await rename(temp, target);
    }
    for (const path of result.removed) await rm(safePath(root, path));
    const serialized = JSON.stringify(next, null, 2) + "\n";
    if (serialized !== raw) {
      const temp = join(root, `${manifestName}.${randomUUID()}.tmp`);
      staged.push(temp);
      await writeFile(temp, serialized, { flag: "wx" });
      await rename(temp, join(root, manifestName));
    }
    return result;
  } finally {
    for (const temp of staged) await rm(temp, { force: true });
    await handle.close();
    await rm(lock, { force: true });
  }
}

function readManifest(root: string, text: string | undefined): Manifest {
  if (text === undefined) return { version: 1, files: {} };
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value["version"] !== 1 || !isRecord(value["files"])) {
    throw new Error("Invalid Wirelit manifest. Preserve it and resolve the conflict before regenerating.");
  }
  const files = Object.fromEntries(
    Object.entries(value["files"]).map(([path, digest]) => {
      safePath(root, path);
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
        throw new Error(`Invalid manifest digest for ${path}`);
      }
      return [path, digest];
    }),
  );
  return { version: 1, files };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function safePath(root: string, path: string): string {
  if (!path.endsWith(".mdx") || path.includes("\\") || isAbsolute(path))
    throw new Error(`Invalid generated path: ${path}`);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith(".." + sep) || rel === ".." || isAbsolute(rel))
    throw new Error(`Generated path escapes output directory: ${path}`);
  return target;
}

async function noSymlinks(target: string) {
  let path = resolve(target);
  for (;;) {
    const info = await lstat(path).catch((error: unknown) => {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    });
    if (info && info.isSymbolicLink())
      throw new Error(`Refusing a symbolic link in the generated output path: ${path}`);
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if (hasErrorCode(e, "ENOENT")) return undefined;
    throw e;
  }
}

export function validateConfig(config: Omit<GenerateOptions, "schema">) {
  if (typeof config.out !== "string" || config.out === "") throw new Error("out must be a non-empty path.");
  if (typeof config.mount !== "string" || !config.mount.startsWith("/") || /[?#\\]|\.\./.test(config.mount))
    throw new Error("mount must be an absolute URL path without query, fragment, or traversal.");
  if (config.baseUrl === undefined) {
    if (config.typescript || config.go || config.grpc === true)
      throw new Error("typescript, go, and grpc examples require a baseUrl.");
  } else {
    let url: URL;
    try {
      url = new URL(config.baseUrl);
    } catch {
      throw new Error("baseUrl must be an absolute HTTP or HTTPS URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      [url.username, url.password, url.search, url.hash].some((value) => value !== "")
    )
      throw new Error("baseUrl must be HTTP or HTTPS without credentials, query, or fragment.");
  }
  if (
    config.services !== undefined &&
    (!Array.isArray(config.services) ||
      config.services.length === 0 ||
      config.services.some((s) => typeof s !== "string"))
  )
    throw new Error("services must be a non-empty list of qualified service names.");
}
