import { clone } from 'ramda';
import { isAbsolute, dirname, resolve } from 'path';
import { COMBINATION_TYPES, REF_TYPE, CUSTOM_KEYWORDS } from './constants';

/**
 * Generate a tree that illustrates the recursive structure of a schema.
 * A single node within the tree defines the following structure:
 * {
 *   schema: ..       // the schema the node is representing
 *   children: [..]   // node objects of the same structure (for subschemas)
 *   path: [..]       // the path from root to node, array of child indexes in
 *                       sequential order (for $refs and indentation level)
 *                       ex. [1, 0] = node at root.children[1].children[0]
 *                                    also has depth of 1 for indent size.
 * }
 *
 * If node is a ref node, it may have a difference structure:
 * {
 *   defaultNode: {..}  // the default node version when a $ref is shrunk
 *                         (a node object as illustrated above)
 *   expandedNode: {..} // the expanded node version when a $ref is expanded
 *                         (a node object as illustrated above)
 *   isExpanded: ..     // whether the node is expanded or not
 * }
 *
 * @param {object} schema
 * @param {array} path path to current node/subtree (ex. [1, 0])
 */
export function createSchemaTree(schema, path = []) {
  /**
   * Create a root node object for the tree/subtree based on the schema.
   * (make sure that node store only schemas transformed appropriately
   *  to the tree node's schema formats)
   */
  const rootNode = {
    schema: transformSchema(schema),
    children: [],
    path,
  };

  /**
   * If schema is a $ref type, create a ref node object instead.
   * (By default, 'isExpanded' is false to render ref row in collapsed form)
   */
  if ('$ref' in rootNode.schema) {
    return {
      defaultNode: rootNode,
      expandedNode: null,
      isExpanded: false,
    };
  }

  /**
   * Depending on whether the schema has a nested structure,
   * create children nodes according to its type and append them
   * sequentially as children to the root node.
   */
  const schemaType = rootNode.schema._type;

  if (COMBINATION_TYPES.includes(schemaType)) {
    createCombinationTree(rootNode);
  } else if (schemaType === 'array') {
    createArrayTree(rootNode);
  } else if (schemaType === 'object') {
    createObjectTree(rootNode);
  }

  return rootNode;
}

/**
 * Transform schema into a form to be stored within a schema tree.
 * * make sure it is a copy separated from the original schema
 * * add custom properties (keywords) for the schema table to utilize
 *   (distinguish added properties with schema's original properties)
 * @param {object} schema
 */
export function transformSchema(schema) {
  const cloneSchema = clone(schema);

  /**
   * Make sure schema has a '_type' property to render according to its type.
   */
  if ('type' in cloneSchema) {
    cloneSchema._type = cloneSchema.type;
  } else {
    /**
     * If type is specified via a keyword for combination or $ref,
     * define the _type property according to that keyword.
     * (if the type is not specified purposely for other reasons,
     *  leave as undefined instead)
     */
    const complexTypes = [...COMBINATION_TYPES, REF_TYPE];

    complexTypes.forEach(type => {
      if (type in cloneSchema) {
        cloneSchema._type = type;
      }
    });
  }

  /**
   * The custom keyword '_id' should be used instead of build-in
   * keyword '$id' for NormalLeftRow to read properly.
   */
  if ('$id' in cloneSchema) {
    cloneSchema._id = cloneSchema.$id;
  }

  /**
   * The custom keyword '_name' should be used instead of build-in
   * keyword 'name' for NormalLeftRow to read properly.
   */
  if ('name' in cloneSchema) {
    cloneSchema._name = cloneSchema.name;
  }

  return cloneSchema;
}

/**
 * Create a child node based on the given subschema and append it to
 * the parentNode. (the child node may be a single node or a subtree)
 * @param {object} parentNode parent node of subschema
 * @param {object} subschema schema of child node to create and append
 * @param {number} childIndex index of the child node (used for its path)
 */
export function createChildNode(parentNode, subschema, childIndex) {
  /**
   * Child node's schema should inherit parent's _id property
   * to ensure all schemas have a reference point.
   */
  const cloneSubschema = clone(subschema);

  cloneSubschema._id = parentNode.schema._id;

  /**
   * Create a child node or subtree based on the subschema
   * and append it to the parent node.
   */
  const childNode = createSchemaTree(cloneSubschema, [
    ...parentNode.path,
    childIndex,
  ]);

  parentNode.children.push(childNode);
}

/**
 * Create a tree for combination data type schemas (allOf, anyOf, oneOf, not).
 * Possible options should be created as children nodes by calling back on
 * the createSchemaTree method and appended the results to given root node.
 * @param {object} rootNode root tree node
 */
export function createCombinationTree(rootNode) {
  const { schema } = rootNode;
  const combType = schema._type;

  /**
   * If there are multiple options (defined in array form),
   * create option child nodes and append them in sequential order.
   */
  if (Array.isArray(schema[combType])) {
    const optionList = schema[combType];

    optionList.forEach((subschema, childIndex) => {
      createChildNode(rootNode, subschema, childIndex);
    });
  } else {
    /**
     * else, if only one option exists, create one child node and append.
     */
    createChildNode(rootNode, schema[combType], 0);
  }
}

/**
 * Create a tree for array data type schemas.
 * Array items should be created as children nodes by calling
 * back on the createSchemaTree method and appended to given root node.
 * @param {object} rootNode root tree node
 */
export function createArrayTree(rootNode) {
  const { schema } = rootNode;

  /**
   * Create child nodes only if array items are defined.
   */
  if ('items' in schema) {
    /**
     * If array items are defined by tuple vaidation (each item may
     * have a different schema and the order of items is important),
     * create array items as child nodes in sequential order.
     */
    if (Array.isArray(schema.items)) {
      schema.items.forEach((subschema, childIndex) => {
        createChildNode(rootNode, subschema, childIndex);
      });
    } else {
      /**
       * else, items are defined by list vaidation (each item matches
       * the same schema), create only one child node.
       */
      createChildNode(rootNode, schema.items, 0);
    }
  }

  /**
   * If array items are defined via 'contains' keyword,
   * (add a 'contains' key set to true to the subschema
   *  in order to use the contains symbol in NormalLeftRow)
   * @param {object} rootNode root tree node
   */
  if ('contains' in schema) {
    const subschema = schema.contains;
    const childIndex = rootNode.children.length;

    subschema._contains = true;
    createChildNode(rootNode, subschema, childIndex);
  }
}

/**
 * Create a tree for object data type schemas.
 * Object properties should be created as children nodes by calling
 * back on the createSchemaTree method and appended to given root node.
 * @param {object} rootNode root tree node
 */
export function createObjectTree(rootNode) {
  const { schema } = rootNode;

  /**
   * Create child nodes only if object properties are defined.
   */
  if ('properties' in schema) {
    /**
     * Memoize required properties in advance for checking if a certain
     * property is required within the object type schema.
     */
    const requiredList =
      'required' in schema ? new Set(schema.required) : new Set();
    const propertyList = Object.keys(schema.properties);

    /**
     * Create object properties as child nodes in sequential order.
     * Make sure to add a name and required field for each of the subschemas
     * so that they are displayed accordingly when creating schemaTable rows.
     */
    propertyList.forEach((property, childIndex) => {
      const cloneSubschema = clone(schema.properties[property]);

      cloneSubschema._name = property;

      if (requiredList.has(property)) {
        cloneSubschema._required = true;
      }

      createChildNode(rootNode, cloneSubschema, childIndex);
    });
  }
}

/**
 * Create a clone of the original schemaTree so that the schemaTree
 * object can be updated without mutating the original schemaTree.
 * Also, create a reference pointer to the corresponding ref node
 * so that it can be used for updating the ref node's value.
 * @param {object} refDefaultNode reference to refNode's defaultNode field
 * @returns {array} [schema Tree clone, ref node pointer]
 */
export function findRefNodeClone(schemaTree, refDefaultNode) {
  /**
   * Create a clone of the schemaTree to maintain immutability.
   */
  const cloneTree = clone(schemaTree);
  /**
   * Traverse the clone tree using the refDefaultNode's path
   * to find the corresponding ref node within the clone tree.
   * ('nodePtr' ultimately points to a refNode with a structure
   *   of defaultNode, expandedNode, isExpanded fields)
   */
  let nodePtr = cloneTree;

  refDefaultNode.path.forEach(childIndex => {
    /**
     * If nodePtr points to a ref node,
     * direct the nodePtr to it's expandedNode field.
     */
    if ('isExpanded' in nodePtr) {
      nodePtr = nodePtr.expandedNode;
    }

    nodePtr = nodePtr.children[childIndex];
  });

  return [cloneTree, nodePtr];
}

/**
 * Update the refNode's state to collapsed form.
 * (creates a new schemaTree object to maintain immutability
 *  of the original schemaTree state)
 * @param {object} refDefaultNode a refNode's defaultNode field
 * @returns {object} a schemaTree clone with refNode updated
 */
export function shrinkRefNode(schemaTree, refDefaultNode) {
  /**
   * Create a clone tree and find the corresponding clone ref node.
   */
  const [cloneTree, refNode] = findRefNodeClone(schemaTree, refDefaultNode);

  /**
   * Update the 'isExpanded' state of the ref node so that
   * the ref row will now display a collapsed version instead.
   */
  refNode.isExpanded = false;

  return cloneTree;
}

/**
 * Update the refNode's state to expanded form.
 * (creates a new schemaTree object to maintain immutability
 *  of the original schemaTree state)
 * @param {object} refDefaultNode a refNode's defaultNode field
 * @param {object} references an object of schema references
 * @returns {object} a schemaTree clone with refNode updated
 */
export function expandRefNode(schemaTree, refDefaultNode, references) {
  /**
   * Create a clone tree and find the corresponding clone ref node.
   */
  const [cloneTree, refNode] = findRefNodeClone(schemaTree, refDefaultNode);

  /**
   * Update the 'isExpanded' state of the ref node so that
   * the ref row will now display an expanded version instead.
   */
  refNode.isExpanded = true;

  /**
   * If ref tree node has never referenced the $ref schema before,
   * fetch the schema and store in expandedNode field in order to
   * cache the referenced schema within the ref node.
   */
  if (!refNode.expandedNode) {
    const referencedSchema = fetchRefSchema(
      refDefaultNode.schema._id,
      refDefaultNode.schema.$ref,
      references
    );

    /**
     * If the ref node's default node has custom fields,
     * also include those same fields within the expanded node.
     */
    CUSTOM_KEYWORDS.forEach(keyword => {
      if (keyword in refDefaultNode.schema && !(keyword in referencedSchema)) {
        referencedSchema[keyword] = refDefaultNode.schema[keyword];
      }
    });

    /**
     * Create a subschema tree based on the fetched ref schema
     * and store the result within the expandedNode field.
     */
    refNode.expandedNode = createSchemaTree(
      referencedSchema,
      refDefaultNode.path
    );
  }

  return cloneTree;
}

/**
 * Fetch the reference schema defined by the $ref
 * @param {string} refNodeId ref default node schema's $id value
 * @param {string} refString ref default node schema's $ref value
 * @param {object} references collection of schema references
 * @returns {object} $ref schema
 */
function fetchRefSchema(refNodeId, refString, references) {
  const [sourcePath, definitionPath] = refString.split('#');
  const refNodePath = refNodeId.slice(0, -1);

  try {
    /**
     * Find the source for the reference.
     */
    const refSchemaPath = resolveFullPath(sourcePath, refNodePath);
    const refSchemaId = refSchemaPath.concat('#');
    let ptr = references[refSchemaId];

    if (!ptr) {
      throw new Error(`Cannot find reference to \`${refSchemaId}\`.`);
    }

    /**
     * Find the definition within the source.
     */
    const parameters = definitionPath.split('/');

    parameters.forEach((parameter, i) => {
      // skip over first parameter since it defaults to empty string ""
      if (i > 0) {
        if (!(parameter in ptr)) {
          throw new Error(
            `Cannot find \`${definitionPath}\` in \`${refSchemaId}\`.`
          );
        }

        ptr = ptr[parameter];
      }
    });

    return ptr;
  } catch (error) {
    /**
     * If cannot find the $ref,
     */
    const errorSchema = {
      type: 'error',
      description: error.message,
    };

    return errorSchema;
  }
}

/**
 * Find the full path of the given source path.
 * @param {string} sourcePath  path of source to find
 * @param {string} currentPath path to resolve when source has relative path
 * @returns {string} full path of the source
 */
function resolveFullPath(sourcePath, currentPath) {
  /**
   * If the source is empty (self-reference to itself),
   * return the current path.
   */
  if (sourcePath.length === 0) {
    return currentPath;
  }

  if (!isAbsolute(sourcePath)) {
    try {
      /**
       * If the source is a URI (ex. "http://json-schema.org/draft-06/schema"),
       * return the path as-is.
       */
      const uri = new URL(sourcePath);

      return uri.toString();
    } catch (error) {
      /**
       * If the source has a relative path (ex. "example.json"),
       * resolve the path against the current path.
       */
      if (error instanceof TypeError) {
        const currentDir = dirname(currentPath);

        return resolve(currentDir, sourcePath);
      }
    }
  }

  /**
   * Else, the source has an absolute path (ex. "schemas/example.json")
   * return the path as-is.
   */
  return sourcePath;
}
