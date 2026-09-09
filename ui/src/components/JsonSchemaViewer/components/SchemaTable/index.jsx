import React from 'react';
import { func, object } from 'prop-types';
import TableLayout from './TableLayout';
import LeftCell from './LeftCell';
import RightCell from './RightCell';
import { treeNodeTypes } from '../../utils/prop-types';
import { createSchemaTree } from '../../utils/schemaTree';
import {
  COMBINATION_TYPES,
  NESTED_TYPES,
  LITERAL_TYPES,
} from '../../utils/constants';

function SchemaTable({ schemaTree, setSchemaTree, references }) {
  const rows = [];

  /**
   * Create a single normal row with a left and right column each, composed
   * of a left and right element
   */
  function createSingleRow(treeNode, refType = 'none') {
    /**
     * If the row to create is a refType (either 'default' or 'expanded'),
     * make sure to pass 'setSchemaTree' method to change the state of the
     * schemaTree. Else, pass null as prop instead.
     */
    const updateFunc = refType === 'none' ? null : setSchemaTree;
    const refs = refType === 'none' ? null : references;

    return {
      left: (
        <LeftCell
          key={`left-row-${rows.length + 1}`}
          treeNode={treeNode}
          refType={refType}
          setSchemaTree={updateFunc}
          references={refs}
        />
      ),
      right: (
        <RightCell key={`right-row-${rows.length + 1}`} treeNode={treeNode} />
      ),
    };
  }

  /**
   * Create a literal row for displaying descriptive rows.
   * This is only used to create rows for the following:
   * - a closing row for nested types (arrays and objects) to display a
   *   close bracket symbol
   * - a separator row for combination types (allOf, anyOf, oneOf, not)
   *   to visually separate options.
   */
  function createLiteralRow(treeNode) {
    const { schema, path } = treeNode;
    const schemaType = schema._type;
    const literalSchema = {
      $id: schema._id,
      type: LITERAL_TYPES[schemaType],
    };
    const literalPath = COMBINATION_TYPES.includes(schemaType)
      ? [...path, 0]
      : path;
    const literalTreeNode = createSchemaTree(literalSchema, literalPath);

    return createSingleRow(literalTreeNode);
  }

  /**
   * Create rows by traversing the tree structure,
   * starting from the rootNode, in pre-order.
   * First, a single row based on the root node will be created.
   * Then, if the root node has children, this method may be called
   * recursively to create rows for the subtree structures.
   */
  function renderNodeToRows(rootNode, refType = 'none') {
    /**
     * If rootNode is a $ref type, render rows based on ref node.
     */
    if ('isExpanded' in rootNode) {
      renderRefNodeToRows(rootNode);

      return;
    }

    /**
     * Create a single row based on the rootNode.
     */
    const { schema, children } = rootNode;
    const schemaType = schema._type;
    const rootNodeRow = createSingleRow(rootNode, refType);

    rows.push(rootNodeRow);

    /**
     * If the root node has children (indicating a nested structure),
     * create rows for each of the child nodes using recursion.
     */
    if (children) {
      children.forEach((childNode, i) => {
        /**
         * If root node's schema defines a combination type,
         * add separator rows in between the option rows
         */
        if (COMBINATION_TYPES.includes(schemaType) && i > 0) {
          const separatorRow = createLiteralRow(rootNode);

          rows.push(separatorRow);
        }

        renderNodeToRows(childNode);
      });
    }

    /**
     * If root node's schema defines a nested structure,
     * add a row at the end to close off the nested structure
     */
    if (NESTED_TYPES.includes(schemaType)) {
      const closeRow = createLiteralRow(rootNode);

      rows.push(closeRow);
    }
  }

  /**
   * Depending on the refTreeNode's 'isExpanded' state,
   * create either a default collapsed version of a refRow
   * or an expanded version of possibly multiple rows.
   */
  function renderRefNodeToRows(refTreeNode) {
    const { defaultNode, expandedNode, isExpanded } = refTreeNode;
    const refType = isExpanded ? 'expanded' : 'default';

    /**
     * If ref node has shrunk state, which is the default,
     * create a single row based on the defaultNode structure
     * defined within the ref node.
     */
    if (!isExpanded) {
      const refRow = createSingleRow(defaultNode, refType);

      rows.push(refRow);
    } else {
      /**
       * Else, the ref node has expanded state,
       * create rows based on the expandedNode structure.
       */
      renderNodeToRows(expandedNode, refType);
    }
  }

  /**
   * Create left and right rows each for the schema table by traversing
   * the schemaTree starting from the root node. The resulting rows will
   * be stored in the 'rows' array.
   */
  renderNodeToRows(schemaTree);

  return <TableLayout rows={rows} />;
}

SchemaTable.propTypes = {
  /**
   * Schema tree structure defining the overall structure
   * for the schema table component.
   */
  schemaTree: treeNodeTypes.isRequired,
  /**
   * Function to update schemaTree structure.
   * Used specifically for expanding or shrinking a $ref.
   */
  setSchemaTree: func.isRequired,
  /**
   * Object where all schemas are stored so that the table
   * can reference to for dereferencing $ref schemas.
   */
  references: object.isRequired,
};

export default React.memo(SchemaTable);
