import {
  shape,
  string,
  arrayOf,
  number,
  array,
  oneOf,
  oneOfType,
  bool,
} from 'prop-types';
import { SUPPORTED_TYPES, ALL_TYPES } from './constants';

/**
 * Schema prop-type for SchemaViewer component.
 */
export const schema = shape({
  /**
   * A unique identifier for the schema.
   * (required as a key to find $ref schema or also as a base URI
   *  against which $ref URIs are resolved)
   */
  $id: string.isRequired,
  /**
   * Type of schema (either a single type or an array of types).
   */
  type: oneOfType([arrayOf(oneOf(SUPPORTED_TYPES)), oneOf(SUPPORTED_TYPES)]),
});
/**
 * Basic tree node structure for schema trees.
 * (denotes the shape of a non-$ref type tree node)
 */
export const basicTreeNode = shape({
  /**
   * Schema or sub-schema given to render upon.
   * (Must be in a sanitized form which uses custom keywords prefixed
   *  with an underscore '_' since those are used as identifiers to
   *  create parts of the rows and lines of the schema table.)
   */
  schema: shape({
    /**
     * A unique identifier for the schema.
     * (used as a key to find $ref schema or also as a base URI
     *  against which $ref URIs are resolved)
     */
    _id: string.isRequired,
    /**
     * Type of schema (either a single type or an array of types).
     * '_type' is used as custom property distinguished from built-in
     * 'type' property.
     */
    _type: oneOfType([arrayOf(oneOf(ALL_TYPES)), oneOf(ALL_TYPES)]),
    /**
     * Descriptive information about schema.
     */
    title: string,
    description: string,
    _name: string,
  }).isRequired,
  /**
   * Path from root to current tree node.
   * Necessary to calculate the indent size for the row.
   */
  path: arrayOf(number).isRequired,
  /**
   * Children nodes of the current node.
   * (include array items, object properties, combination options)
   */
  children: array,
});

/**
 * $Ref Tree node structure for schema trees.
 * (denotes the shape of a $ref type tree node)
 */
export const refTreeNode = shape({
  /**
   * The default tree node version when a $ref is shrunk.
   */
  defaultNode: basicTreeNode.isRequired,
  /**
   * The expanded tree node version when a $ref is expanded.
   * (not a required fields since it is set to null by default)
   */
  expandedNode: basicTreeNode,
  /**
   * whether the node is expanded or not
   */
  isExpanded: bool.isRequired,
});
/**
 * Tree node prop-types within a schema tree.
 * Can either be a basic tree node type or a ref tree node type.
 */
export const treeNodeTypes = oneOfType([basicTreeNode, refTreeNode]);
/**
 * Empty Function to use for default props
 */
export const NOOP = () => {};
