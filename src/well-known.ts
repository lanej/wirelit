/** Only these messages have special ProtoJSON representations. Other messages
 * in google.protobuf (for example Type or Api) still have normal fields. */
export const wktJson: Record<string, string> = {
  'google.protobuf.Timestamp': 'RFC 3339 string', 'google.protobuf.Duration': 'Duration string',
  'google.protobuf.Any': 'Object with @type', 'google.protobuf.FieldMask': 'Comma-separated string',
  'google.protobuf.Struct': 'JSON object', 'google.protobuf.Value': 'Any JSON value',
  'google.protobuf.ListValue': 'JSON array', 'google.protobuf.Empty': 'Empty object',
  'google.protobuf.DoubleValue': 'Number', 'google.protobuf.FloatValue': 'Number',
  'google.protobuf.Int64Value': 'Decimal string', 'google.protobuf.UInt64Value': 'Decimal string',
  'google.protobuf.Int32Value': 'Number', 'google.protobuf.UInt32Value': 'Number',
  'google.protobuf.BoolValue': 'Boolean', 'google.protobuf.StringValue': 'String', 'google.protobuf.BytesValue': 'Base64 string',
};
