/**
 * Keywords used in schemas to define the basic types.
 */
export const BASIC_TYPES = ['string', 'integer', 'number', 'boolean', 'null'];
/**
 * Keywords used in schema to define nested types.
 * Define schemas for structure with an open row, child rows, and close row.
 */
export const NESTED_TYPES = ['object', 'array'];
/**
 * Keywords used in schema to define combination types.
 */
export const COMBINATION_TYPES = ['allOf', 'anyOf', 'oneOf', 'not'];
/**
 * Keyword used in schema to define $ref types.
 */
export const REF_TYPE = '$ref';
/**
 * Custom type keywords used to define schemas used for literal schemas,
 * which are used to create literal rows, such as a closing or separating row.
 */
export const LITERAL_TYPES = {
  array: 'closeArray',
  object: 'closeObject',
  allOf: 'and',
  anyOf: 'or',
  oneOf: 'or',
  not: 'nor',
};
/**
 * Custom type keyword used to define schema with errors.
 * (used specifically for when a $ref schema cannot be found)
 */
export const ERROR_TYPE = 'error';
/**
 * Types supported by json schemas:
 * https://json-schema.org/understanding-json-schema/reference/type.html#type
 */
export const SUPPORTED_TYPES = [...BASIC_TYPES, ...NESTED_TYPES];
/**
 * All the keywords used to define the possible types used for the schemaTable.
 */
export const ALL_TYPES = [
  ...BASIC_TYPES,
  ...NESTED_TYPES,
  ...COMBINATION_TYPES,
  ...Object.values(LITERAL_TYPES),
  REF_TYPE,
  ERROR_TYPE,
];
/**
 * Keywords used in schema that are descriptors.
 * These are used to display in the rows of the right panel
 * in separation with specification keywords by a blank line.
 */
export const DESCRIPTIVE_KEYWORDS = ['title', 'description'];
/**
 * Custom keywords created within the schemas of the tree nodes.
 * An underscore is prefixed for these keywords in order to
 * distinguish them with the built-in keywords for schemas.
 */
export const CUSTOM_KEYWORDS = [
  '_type',
  '_contains',
  '_required',
  '_name',
  '_id',
];
/**
 * Keywords used in schemas that will be ignored when
 * creating lines for the rows in the left and right panels.
 * These are typically skipped over since they may already be
 * illustrated in other formats within the SchemaTable.
   (ex. symbols in the left panel)
 */
export const SKIP_KEYWORDS = [
  ...CUSTOM_KEYWORDS,
  '$id',
  '$schema',
  'type',
  'name',
  'title',
  'description',
  'items',
  'contains',
  'properties',
  'required',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  '$ref',
  'definitions',
];
/**
 * Symbols used to display bracket types.
 */
export const BRACKET_SYMBOLS = {
  array: '[',
  object: '{',
  closeArray: ']',
  closeObject: '}',
};
/**
 * Symbols (text) used to display combination types.
 */
export const COMBINATION_SYMBOLS = {
  allOf: '// All of',
  anyOf: '// Any of',
  oneOf: '// One of',
  not: '// Not',
  and: '// and',
  or: '// or',
  nor: '// nor',
};
/**
 * Descriptions used for keywords displayed with tooltip.
 */
export const TOOLTIP_DESCRIPTIONS = {
  additionalItems:
    'Additional items must match a sub-schema. See the JSON-schema source for details.',
  additionalProperties:
    'Additional properties must match a sub-schema. See the JSON-schema source for details.',
  dependencies:
    'The schema of the object may change based on the presence of certain special properties. See the JSON-schema source for details.',
  propertyNames:
    'Names of properties must follow a specified convention. See the JSON-schema source for details.',
  patternProperties:
    'Property names or values should match the specified pattern. See the JSON-schema source for details.',
  required: 'Required property',
  contains: 'Only needs to validate against one or more items in the array',
  noType:
    'Type of schema is not specified. See the JSON-schema source for details.',
};
