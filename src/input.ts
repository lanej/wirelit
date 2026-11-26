import type { JsonValue } from "@bufbuild/protobuf";
import type { MethodExample, WirelitConfig } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isTypeScriptConfig = (value: unknown): value is NonNullable<WirelitConfig["typescript"]> =>
  isRecord(value) && isString(value["module"]);
const isGoConfig = (value: unknown): value is NonNullable<WirelitConfig["go"]> =>
  isRecord(value) && isString(value["messageImport"]) && isString(value["connectImport"]);

const configValidators = {
  schema: isString,
  out: isString,
  mount: isString,
  baseUrl: isString,
  transportNote: isString,
  title: isString,
  services: isStrings,
  protocolGuide: isString,
  sourceVersion: isString,
  examples: isString,
  grpc: isBoolean,
  typescript: isTypeScriptConfig,
  go: isGoConfig,
} satisfies { [Key in keyof WirelitConfig]-?: (value: unknown) => value is NonNullable<WirelitConfig[Key]> };

function knownOption(key: string): key is keyof WirelitConfig {
  return Object.hasOwn(configValidators, key);
}

function validateOptions(value: unknown): asserts value is Partial<WirelitConfig> {
  if (!isRecord(value)) throw new Error("Wirelit configuration must be a JSON object.");
  for (const [key, setting] of Object.entries(value)) {
    if (!knownOption(key)) throw new Error(`Unknown configuration option: ${key}`);
    if (!configValidators[key](setting)) throw new Error(`Invalid configuration option: ${key}`);
  }
}

export function parseConfig(text: string): Partial<WirelitConfig> {
  const value: unknown = JSON.parse(text);
  validateOptions(value);
  return value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || isString(value) || isBoolean(value) || typeof value === "number") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isMethodExample(value: unknown): value is MethodExample {
  if (!isRecord(value)) return false;
  const { request, response, responses, notes, errors } = value;
  return (
    (request === undefined || isJsonValue(request)) &&
    (response === undefined || isJsonValue(response)) &&
    (responses === undefined || (Array.isArray(responses) && responses.every(isJsonValue))) &&
    (notes === undefined || isString(notes)) &&
    (errors === undefined ||
      (Array.isArray(errors) &&
        errors.every((entry: unknown) => isRecord(entry) && isString(entry["code"]) && isString(entry["message"]))))
  );
}

export function parseExamples(text: string): Record<string, MethodExample> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("Wirelit examples must be a JSON object keyed by method.");
  return Object.fromEntries(
    Object.entries(value).map(([method, example]) => {
      if (!isMethodExample(example)) throw new Error(`Invalid method example: ${method}`);
      return [method, example];
    }),
  );
}
