import {
  createFileRegistry, fromBinary, getOption, hasOption, toJson,
  type DescEnum, type DescEnumValue, type DescField, type DescMessage,
  type DescMethod, type DescService, type FileRegistry, type JsonValue, type Message,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema, type DescriptorProto, type FileDescriptorProto } from '@bufbuild/protobuf/wkt';
import { wktJson } from './well-known.js';

export type Symbol = DescService | DescMethod | DescMessage | DescEnum | DescField | DescEnumValue;
export interface SchemaModel {
  registry: FileRegistry;
  services: DescService[];
  types: (DescMessage | DescEnum)[];
  comment: (symbol: Symbol) => string;
  rules: (field: DescField) => JsonValue | undefined;
  warnings: string[];
}

export function readSchema(bytes: Uint8Array, selected?: string[]): SchemaModel {
  const set = fromBinary(FileDescriptorSetSchema, bytes);
  if (!set.file.length) throw new Error('The descriptor set contains no files. Use buf build --as-file-descriptor-set.');
  const registry = createFileRegistry(set);
  const services = Array.from(registry).filter((d): d is DescService => d.kind === 'service')
    .filter(d => !selected || selected.includes(d.typeName)).sort((a, b) => a.typeName.localeCompare(b.typeName));
  for (const name of selected ?? []) {
    if (!services.some(s => s.typeName === name)) throw new Error(`Service not found: ${name}`);
  }
  if (!services.length) throw new Error('No services selected. Provide a descriptor set containing an RPC service.');

  const comments = new WeakMap<object, string>();
  for (const file of set.file) collectComments(file, comments);
  const reached = new Map<string, DescMessage | DescEnum>();
  function visit(type: DescMessage | DescEnum) {
    if (reached.has(type.typeName)) return;
    reached.set(type.typeName, type);
    if (type.kind === 'message' && !Object.hasOwn(wktJson, type.typeName)) {
      for (const field of type.fields) {
        if (field.message) visit(field.message);
        if (field.enum) visit(field.enum);
      }
    }
  }
  for (const service of services) for (const method of service.methods) { visit(method.input); visit(method.output); }
  const types = Array.from(reached.values()).sort((a, b) => a.typeName.localeCompare(b.typeName));
  const sourceFiles = new Set([...services.map(s => s.file), ...types.filter(t => !t.typeName.startsWith('google.protobuf.')).map(t => t.file)]);
  const warnings = Array.from(sourceFiles).filter(f => !f.proto.sourceCodeInfo?.location.length)
    .map(f => `No source comments in ${f.name}. Include source information when compiling descriptors.`);
  const validation = registry.getExtension('buf.validate.field');
  return {
    registry, services, types, warnings,
    comment: s => comments.get(s.proto) ?? '',
    rules: field => {
      if (!validation || !hasOption(field, validation) || validation.fieldKind !== 'message') return undefined;
      return toJson(validation.message, getOption(field, validation) as Message, { registry });
    },
  };
}

function collectComments(file: FileDescriptorProto, comments: WeakMap<object, string>) {
  const paths = new Map((file.sourceCodeInfo?.location ?? []).map(l => [l.path.join('.'),
    [l.leadingComments, l.trailingComments].filter(Boolean).join('\n').split('\n').map(s => s.replace(/^ /, '')).join('\n').trim()]));
  const add = (proto: object, path: number[]) => comments.set(proto, paths.get(path.join('.')) ?? '');
  function message(proto: DescriptorProto, path: number[]) {
    add(proto, path);
    proto.field.forEach((v, i) => add(v, [...path, 2, i]));
    proto.nestedType.forEach((v, i) => message(v, [...path, 3, i]));
    proto.enumType.forEach((v, i) => enumeration(v, [...path, 4, i]));
  }
  function enumeration(proto: FileDescriptorProto['enumType'][number], path: number[]) {
    add(proto, path);
    proto.value.forEach((v, i) => add(v, [...path, 2, i]));
  }
  file.messageType.forEach((v, i) => message(v, [4, i]));
  file.enumType.forEach((v, i) => enumeration(v, [5, i]));
  file.service.forEach((v, i) => {
    add(v, [6, i]);
    v.method.forEach((m, j) => add(m, [6, i, 2, j]));
  });
}

export function symbolId(symbol: Symbol): string {
  if ('typeName' in symbol) return symbol.typeName;
  return `${symbol.parent.typeName}.${symbol.name}`;
}

export function symbolPath(symbol: DescService | DescMethod | DescMessage | DescEnum): string {
  const slug = (name: string) => name.toLowerCase().replaceAll('.', '-');
  if (symbol.kind === 'rpc') return `services/${slug(symbol.parent.typeName)}/${symbol.name.toLowerCase()}`;
  return `${symbol.kind === 'service' ? 'services' : 'types'}/${slug(symbol.typeName)}`;
}
