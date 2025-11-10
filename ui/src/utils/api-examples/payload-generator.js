/**
 * Generate example payloads from JSON schemas
 *
 * This module creates example JSON payloads based on JSON Schema definitions,
 * providing developers with concrete starting points for API calls.
 */

import { PLACEHOLDERS, getPlaceholderValue } from './helpers';

/**
 * Get contextual placeholder value for known property names
 *
 * @param {string} propertyName - Property name
 * @param {string} type - JSON Schema type
 * @returns {*|null} Placeholder value or null if not found
 */
function getContextualPlaceholder(propertyName, type) {
  // Use existing placeholder system for known names
  const placeholder = getPlaceholderValue(propertyName);

  // If meaningful value (not wrapped in <>), use it
  if (placeholder && !placeholder.startsWith('<')) {
    return placeholder;
  }

  // Additional context-aware mappings
  const lowerName = propertyName.toLowerCase();

  // Taskcluster-specific ID patterns (only for string types)
  if (type === 'string' && lowerName.includes('taskid')) {
    return PLACEHOLDERS.taskId;
  }

  if (
    type === 'string' &&
    (lowerName.includes('taskgroupid') || lowerName === 'taskgroupid')
  ) {
    return PLACEHOLDERS.taskGroupId;
  }

  if (type === 'string' && lowerName.includes('workerid')) {
    return PLACEHOLDERS.workerId;
  }

  if (type === 'string' && lowerName.includes('workerpoolid')) {
    return PLACEHOLDERS.workerPoolId;
  }

  if (type === 'string' && lowerName.includes('provisionid')) {
    return PLACEHOLDERS.provisionerId;
  }

  if (type === 'string' && lowerName.includes('workertype')) {
    return PLACEHOLDERS.workerType;
  }

  if (type === 'string' && lowerName.includes('clientid')) {
    return PLACEHOLDERS.clientId;
  }

  if (type === 'string' && lowerName.includes('accesstoken')) {
    return PLACEHOLDERS.accessToken;
  }

  if (type === 'string' && lowerName.includes('hookgroupid')) {
    return PLACEHOLDERS.hookGroupId;
  }

  if (type === 'string' && lowerName.includes('hookid')) {
    return PLACEHOLDERS.hookId;
  }

  // Timestamp patterns
  if (lowerName.includes('deadline') || lowerName.includes('expires')) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  if (lowerName.includes('created')) {
    return new Date().toISOString();
  }

  // Scope patterns (return array for type array)
  if (lowerName.includes('scope') && type === 'array') {
    return ['queue:create-task:highest:my-provider/*'];
  }

  // Route patterns (return array for type array)
  if (lowerName.includes('route') && type === 'array') {
    return ['index.project.taskcluster.example'];
  }

  // Common patterns for names
  if (lowerName.includes('name') && type === 'string') {
    return 'example-name';
  }

  // Common patterns for counts/limits
  if (
    (lowerName.includes('count') || lowerName === 'limit') &&
    (type === 'number' || type === 'integer')
  ) {
    return 10;
  }

  // Owner pattern (email)
  if (lowerName === 'owner' || lowerName.includes('owner')) {
    return 'user@example.com';
  }

  return null;
}

/**
 * Navigate JSON pointer path in schema
 * @param {object} schema - Schema object
 * @param {string} path - JSON pointer path like "#/properties/config"
 * @returns {object|null} Resolved schema or null
 */
function navigateJsonPointer(schema, path) {
  if (!path || path === '#') {
    return schema;
  }

  const parts = path.replace(/^#\//, '').split('/');

  return parts.reduce((current, part) => {
    if (!current || typeof current !== 'object') {
      return null;
    }

    return current[part];
  }, schema);
}

/**
 * Resolve a $ref to its actual schema definition
 * @param {string} ref - Reference like "worker-pool-full.json#/path"
 * @param {string} currentSchemaId - Current schema $id for internal refs
 * @param {Array} allSchemas - All available schemas
 * @param {Set} visitedRefs - Track visited refs to prevent cycles
 * @returns {object|null} Resolved schema or null
 */
function resolveRef(ref, currentSchemaId, allSchemas, visitedRefs = new Set()) {
  if (visitedRefs.has(ref)) {
    return null; // Circular reference
  }

  visitedRefs.add(ref);

  // Parse ref into filename and path
  const [fileRef, pathRef] = ref.split('#');
  let targetSchema;

  // Internal reference (same file)
  if (!fileRef || fileRef === '') {
    // Find the root schema document using the current schema ID
    targetSchema = allSchemas.find(
      s => s.content && s.content.$id === currentSchemaId
    );

    if (!targetSchema) {
      return null;
    }

    const resolved = navigateJsonPointer(
      targetSchema.content,
      `#${pathRef || ''}`
    );

    // If resolved schema has a $ref, resolve it recursively
    if (resolved && resolved.$ref) {
      return resolveRef(
        resolved.$ref,
        currentSchemaId,
        allSchemas,
        visitedRefs
      );
    }

    return resolved;
  }

  // External reference - find schema by filename in $id
  targetSchema = allSchemas.find(
    s => s.content && s.content.$id && s.content.$id.endsWith(fileRef)
  );

  if (!targetSchema) {
    return null;
  }

  // Navigate path in target schema
  const resolved = navigateJsonPointer(
    targetSchema.content,
    `#${pathRef || ''}`
  );

  // If resolved schema has a $ref, resolve it recursively with the new
  // schema context
  if (resolved && resolved.$ref) {
    return resolveRef(
      resolved.$ref,
      targetSchema.content.$id,
      allSchemas,
      visitedRefs
    );
  }

  return resolved;
}

/**
 * Generate example for string type
 *
 * @param {object} schema - JSON Schema definition
 * @param {string} propertyName - Property name
 * @returns {string} Example string value
 */
function generateStringExample(schema, propertyName) {
  // Use default if available
  if (schema.default !== undefined) {
    return schema.default;
  }

  // Use enum if available (pick first value)
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // Use examples if available
  if (schema.examples && schema.examples.length > 0) {
    return schema.examples[0];
  }

  // Handle format with realistic values
  if (schema.format) {
    switch (schema.format) {
      case 'date-time':
        return new Date().toISOString();
      case 'date':
        return new Date().toISOString().split('T')[0];
      case 'time':
        return new Date().toISOString().split('T')[1];
      case 'email':
        return 'user@example.com';
      case 'hostname':
        return 'example.com';
      case 'uri':
      case 'url':
        return 'https://example.com';
      case 'uuid':
        return '00000000-0000-0000-0000-000000000000';
      default:
        break;
    }
  }

  // Use contextual placeholder for known property names
  const contextual = getContextualPlaceholder(propertyName, 'string');

  if (contextual) {
    return contextual;
  }

  // Use minLength as hint for string length
  if (schema.minLength && schema.minLength > 0) {
    return 'x'.repeat(Math.min(schema.minLength, 20));
  }

  // Contextual string values based on property name
  const lowerName = propertyName ? propertyName.toLowerCase() : '';

  if (lowerName.includes('name')) {
    return 'example-name';
  }

  if (lowerName.includes('description')) {
    return 'Example description';
  }

  if (lowerName.includes('url') || lowerName.includes('uri')) {
    return 'https://example.com';
  }

  if (lowerName.includes('email')) {
    return 'user@example.com';
  }

  // Use pattern as hint if available
  if (schema.pattern) {
    // Try to generate a realistic value for common patterns
    if (
      schema.pattern.includes('[a-z]') ||
      schema.pattern.includes('[a-zA-Z]')
    ) {
      return 'example-value';
    }

    if (schema.pattern.includes('\\d') || schema.pattern.includes('[0-9]')) {
      return '0';
    }

    return 'example-value';
  }

  // Default to empty string (zero value) instead of placeholder
  return '';
}

/**
 * Generate example for number/integer type
 *
 * @param {object} schema - JSON Schema definition
 * @param {string} propertyName - Property name for context
 * @returns {number} Example number value
 */
function generateNumberExample(schema, propertyName = '') {
  // Use default if available
  if (schema.default !== undefined) {
    return schema.default;
  }

  // Use examples if available
  if (schema.examples && schema.examples.length > 0) {
    return schema.examples[0];
  }

  // Use minimum if specified
  if (schema.minimum !== undefined) {
    return schema.minimum;
  }

  // Use middle of range if both min and max specified
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    return Math.floor((schema.minimum + schema.maximum) / 2);
  }

  // Contextual number values based on property name
  const lowerName = propertyName ? propertyName.toLowerCase() : '';

  if (lowerName.includes('count') || lowerName.includes('limit')) {
    return 10;
  }

  if (lowerName.includes('priority')) {
    return 0;
  }

  if (lowerName.includes('retries') || lowerName.includes('retry')) {
    return 5;
  }

  if (lowerName.includes('timeout') || lowerName.includes('maxruntime')) {
    return 600; // 10 minutes in seconds
  }

  // Default to 0 for integer, 0.0 for number
  return schema.type === 'integer' ? 0 : 0.0;
}

/**
 * Generate example for array type
 *
 * @param {object} schema - JSON Schema definition
 * @param {string} propertyName - Property name
 * @param {Set} visited - Set of visited schema $ids
 * @param {Array} allSchemas - All available schemas
 * @param {string} currentSchemaId - Current schema $id
 * @param {Set} visitedRefs - Set of visited $refs
 * @returns {Array} Example array value
 */
function generateArrayExample(
  schema,
  propertyName,
  visited,
  allSchemas,
  currentSchemaId,
  visitedRefs
) {
  // Use default if available
  if (schema.default !== undefined) {
    return schema.default;
  }

  // Use examples if available
  if (schema.examples && schema.examples.length > 0) {
    return schema.examples[0];
  }

  // Check for contextual array values (e.g., scopes, routes)
  const contextual = getContextualPlaceholder(propertyName, 'array');

  if (contextual && Array.isArray(contextual)) {
    return contextual;
  }

  // Generate array with one example item if items schema is defined
  if (schema.items) {
    // eslint-disable-next-line no-use-before-define
    const itemExample = generateExampleValue(
      schema.items,
      propertyName,
      visited,
      allSchemas,
      currentSchemaId,
      visitedRefs
    );

    return [itemExample];
  }

  // Empty array
  return [];
}

/**
 * Generate example for object type
 *
 * @param {object} schema - JSON Schema definition
 * @param {Set} visited - Set of visited schema $ids
 * @param {Array} allSchemas - All available schemas
 * @param {string} currentSchemaId - Current schema $id
 * @param {Set} visitedRefs - Set of visited $refs
 * @returns {object} Example object value
 */
function generateObjectExample(
  schema,
  visited,
  allSchemas,
  currentSchemaId,
  visitedRefs
) {
  // Use default if available (but avoid empty arrays as default)
  if (schema.default !== undefined && !Array.isArray(schema.default)) {
    return schema.default;
  }

  // Use examples if available
  if (schema.examples && schema.examples.length > 0) {
    return schema.examples[0];
  }

  const example = {};

  // Generate examples for all properties (prioritize required)
  if (schema.properties) {
    const required = schema.required || [];

    // Add required properties first
    required.forEach(propName => {
      if (schema.properties[propName]) {
        // eslint-disable-next-line no-use-before-define
        example[propName] = generateExampleValue(
          schema.properties[propName],
          propName,
          visited,
          allSchemas,
          currentSchemaId,
          visitedRefs
        );
      }
    });

    // Optionally add one non-required property as an example
    const optionalProps = Object.keys(schema.properties).filter(
      propName => !required.includes(propName)
    );

    if (optionalProps.length > 0 && required.length < 3) {
      // Only add optional if we don't have too many required
      const propName = optionalProps[0];

      // eslint-disable-next-line no-use-before-define
      example[propName] = generateExampleValue(
        schema.properties[propName],
        propName,
        visited,
        allSchemas,
        currentSchemaId,
        visitedRefs
      );
    }
  }

  // If no properties defined but additionalProperties allowed, add example
  if (
    Object.keys(example).length === 0 &&
    schema.additionalProperties !== false
  ) {
    example.exampleKey = 'example-value';
  }

  return example;
}

/**
 * Generate an example value based on JSON Schema type
 *
 * @param {object} schema - JSON Schema definition
 * @param {string} propertyName - Property name
 * @param {Set} visited - Set of visited schema $ids to prevent cycles
 * @param {Array} allSchemas - All available schemas from references.json
 * @param {string} currentSchemaId - Current schema $id for resolving refs
 * @param {Set} visitedRefs - Set of visited $refs to prevent cycles
 * @returns {*} Example value matching the schema
 */
function generateExampleValue(
  schema,
  propertyName = '',
  visited = new Set(),
  allSchemas = [],
  currentSchemaId = null,
  visitedRefs = new Set()
) {
  if (!schema) {
    return {};
  }

  // Handle $ref - resolve to actual schema definition
  if (schema.$ref) {
    // Determine the schema ID to use for resolution
    const schemaIdForResolution = currentSchemaId || schema.$id;
    const resolved = resolveRef(
      schema.$ref,
      schemaIdForResolution,
      allSchemas,
      visitedRefs
    );

    if (resolved) {
      // Determine the new schema ID context
      const newSchemaId = resolved.$id || schemaIdForResolution;

      return generateExampleValue(
        resolved,
        propertyName,
        visited,
        allSchemas,
        newSchemaId,
        visitedRefs
      );
    }
    // If resolution fails, fall through to default handling
  }

  // Handle schema references (prevent infinite recursion)
  if (schema.$id) {
    if (visited.has(schema.$id)) {
      return `<${schema.$id}>`;
    }

    visited.add(schema.$id);
  }

  // Update current schema ID if present
  const effectiveSchemaId = schema.$id || currentSchemaId;

  // Handle oneOf - pick the first option
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    return generateExampleValue(
      schema.oneOf[0],
      propertyName,
      visited,
      allSchemas,
      effectiveSchemaId,
      visitedRefs
    );
  }

  // Handle anyOf - pick the first option
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    return generateExampleValue(
      schema.anyOf[0],
      propertyName,
      visited,
      allSchemas,
      effectiveSchemaId,
      visitedRefs
    );
  }

  // Handle allOf - merge all schemas (simplified)
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged = {};

    schema.allOf.forEach(subSchema => {
      // eslint-disable-next-line no-use-before-define
      const example = generateExampleValue(
        subSchema,
        propertyName,
        visited,
        allSchemas,
        effectiveSchemaId,
        visitedRefs
      );

      if (typeof example === 'object' && example !== null) {
        Object.assign(merged, example);
      }
    });

    return merged;
  }

  // Handle enum - pick the first value
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // Handle const
  if ('const' in schema) {
    return schema.const;
  }

  // Get type (can be string or array)
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  // Prefer non-null types if available
  const type = types.find(t => t !== 'null') || types[0];

  // Generate value based on type
  switch (type) {
    case 'string':
      return generateStringExample(schema, propertyName);
    case 'number':
    case 'integer':
      return generateNumberExample(schema, propertyName);
    case 'boolean':
      return schema.default !== undefined ? schema.default : false;
    case 'array':
      return generateArrayExample(
        schema,
        propertyName,
        visited,
        allSchemas,
        effectiveSchemaId,
        visitedRefs
      );
    case 'object':
      return generateObjectExample(
        schema,
        visited,
        allSchemas,
        effectiveSchemaId,
        visitedRefs
      );
    case 'null':
      // Avoid returning null for non-nullable fields
      return types.length === 1 ? {} : null;
    default:
      // Default to object for unknown types
      return schema.default !== undefined ? schema.default : {};
  }
}

/**
 * Generate an example payload from a JSON schema
 *
 * @param {object} schema - JSON Schema definition
 * @param {Array} allSchemas - All available schemas from references.json
 * @returns {object|null} Example payload object
 */
export default function generatePayloadExample(schema, allSchemas = []) {
  if (!schema) {
    return null;
  }

  try {
    return generateExampleValue(
      schema,
      '',
      new Set(),
      allSchemas,
      schema.$id,
      new Set()
    );
  } catch (error) {
    // Error generating payload example
    return null;
  }
}
