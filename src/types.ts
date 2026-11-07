import type { JsonValue } from '@bufbuild/protobuf';

export interface MethodExample {
  request?: JsonValue;
  response?: JsonValue;
  responses?: JsonValue[];
  notes?: string;
  errors?: { code: string; message: string }[];
}

export interface WirelitConfig {
  /** Binary FileDescriptorSet, including imports and source information. */
  schema: string;
  /** Dedicated directory under the host's src/content/docs. */
  out: string;
  /** Public URL prefix for that directory, including the host's base path. */
  mount: string;
  /** Connect server base URL. Omit for non-public transports: pages then show path-only endpoints and no client snippets. */
  baseUrl?: string;
  /** Markdown shown under each method's Connect endpoint, such as how the host reaches the server. */
  transportNote?: string;
  title?: string;
  services?: string[];
  protocolGuide?: string;
  sourceVersion?: string;
  examples?: string;
  grpc?: boolean;
  typescript?: { module: string };
  go?: { messageImport: string; connectImport: string };
}

export interface GenerateOptions extends Omit<WirelitConfig, 'schema' | 'examples'> {
  schema: Uint8Array;
  examples?: Record<string, MethodExample>;
}

export interface GenerateResult {
  written: string[];
  removed: string[];
  unchanged: string[];
  warnings: string[];
}
