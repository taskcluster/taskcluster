import React from 'react';
import { oneOf, func, object } from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import ExpandIcon from 'mdi-react/MenuRightIcon';
import ShrinkIcon from 'mdi-react/MenuDownIcon';
import WarningIcon from 'mdi-react/AlertOutlineIcon';
import Tooltip from '../Tooltip';
import { basicTreeNode, NOOP } from '../../utils/prop-types';
import { expandRefNode, shrinkRefNode } from '../../utils/schemaTree';
import {
  COMBINATION_TYPES,
  LITERAL_TYPES,
  NESTED_TYPES,
  BRACKET_SYMBOLS,
  COMBINATION_SYMBOLS,
  TOOLTIP_DESCRIPTIONS,
} from '../../utils/constants';

const useStyles = makeStyles(theme => ({
  /**
   * Dynamically generate styles for indentations to be used for
   * displaying the data structure of the schemas.
   */
  indentation: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    marginLeft: indent => theme.spacing(indent * 2),
  },

  /**
   * Typography within the cell
   */
  typography: {
    color: theme.palette.text.primary,
    display: 'flex',
    alignItems: 'center',
  },

  /**
   * Name text displayed within a LeftCell.
   */
  name: {
    marginRight: theme.spacing(0.5),
    fontFamily: 'monospace',
  },
  /**
   * Highlight the type for the schema or sub-schema displayed
   * within a LeftCell.
   */
  code: {
    backgroundColor: theme.palette.text.primary,
    color: theme.palette.getContrastText(theme.palette.text.primary),
    padding: `0 ${theme.spacing(0.5)}px`,
    fontSize: theme.typography.subtitle2.fontSize,
    fontWeight: theme.typography.subtitle2.fontWeight,
    fontFamily: 'monospace',
  },
  /**
   * Warning icon to inform missing type in LeftCell.
   */
  missingType: {
    display: 'flex',
    alignItems: 'center',
  },
  /**
   * Comments used for combination types in LeftCell.
   */
  comment: {
    color: theme.palette.text.hint,
  },
  /**
   * Prefixes used to notate special properties of data types in
   * lines of LeftCell. (ex. 'required', 'contains' keywords)
   */
  prefix: {
    color: theme.palette.error.main,
    padding: `0 ${theme.spacing(0.5)}px`,
  },
  /**
   * Button used to expand or shrink a $ref.
   */
  refButton: {
    marginLeft: theme.spacing(1),
  },
}));

function LeftCell({ treeNode, refType, setSchemaTree, references }) {
  const { schema, path } = treeNode;
  const schemaType = schema._type;
  const name = schema._name;
  /**
   * Dynamically generate indent styles using the length of the path.
   * (length of path = depth of the current treeNode)
   */
  const indentSize = path.length;
  const classes = useStyles(indentSize);
  /**
   * Create a text for the name of the schema.
   */
  const nameText = (function createNameText(name, type) {
    if (COMBINATION_TYPES.includes(type)) {
      return <span className={classes.name}>{`${name}:`}</span>;
    }

    return <span className={classes.name}>{`${name}:`}</span>;
  })(name, schemaType);
  /**
   * Create a type symbol corresponding to the specified type.
   */
  const typeSymbol = (function createTypeSymbol(type) {
    const bracketTypes = [
      ...NESTED_TYPES,
      LITERAL_TYPES.array,
      LITERAL_TYPES.object,
    ];
    const combinationTypes = [
      ...COMBINATION_TYPES,
      ...COMBINATION_TYPES.map(type => LITERAL_TYPES[type]),
    ];

    /**
     * If type is not specified, create a tooltip with an icon
     * to indicate that the schema is missing a type property.
     */
    if (!type) {
      return (
        <Tooltip title={TOOLTIP_DESCRIPTIONS.noType}>
          <div className={classes.missingType}>
            <WarningIcon />
          </div>
        </Tooltip>
      );
    }

    /**
     * Types with nested structures use a single bracket symbol.
     * (either for opening a bracket or closing a bracket)
     */
    if (bracketTypes.includes(type)) {
      return BRACKET_SYMBOLS[type];
    }

    /**
     * Combination types (allOf, anyOf, oneOf, no) use comments.
     */
    if (combinationTypes.includes(type)) {
      return (
        <span className={classes.comment}>{COMBINATION_SYMBOLS[type]}</span>
      );
    }

    /**
     * In case of an array of types (multiple types),
     * create an array of type symbols with highlighted text format,
     * with each symbol separated with a comma with each other.
     */
    if (Array.isArray(type)) {
      const typeArray = [];

      type.forEach((eachType, i) => {
        if (i > 0) {
          typeArray.push(<span key={`${eachType}-comma`}>,</span>);
        }

        typeArray.push(
          <code key={eachType} className={classes.code}>
            {eachType}
          </code>
        );
      });

      return typeArray;
    }

    /**
     * By default, types use highlighted code format.
     */
    return <code className={classes.code}>{type}</code>;
  })(schemaType);
  /**
   * Create a required/contains mark if needed for schema.
   */
  const requiredMark = (function createPrefix(schema) {
    if (schema._required) {
      return (
        <Tooltip title={TOOLTIP_DESCRIPTIONS.required}>
          <span className={classes.prefix}>*</span>
        </Tooltip>
      );
    }

    if (schema._contains) {
      return (
        <Tooltip title={TOOLTIP_DESCRIPTIONS.contains}>
          <span className={classes.prefix}>⊃</span>
        </Tooltip>
      );
    }

    return null;
  })(schema);
  /**
   * If treeNode is $ref type, create $ref icon button for expanding
   * or shrinking the row depending on the the refType prop.
   */
  const refButton = {
    none: null,
    default: (
      <IconButton
        className={classes.refButton}
        aria-label="expand-ref"
        size="small">
        <ExpandIcon size={24} />
      </IconButton>
    ),
    expanded: (
      <IconButton
        className={classes.refButton}
        aria-label="shrink-ref"
        size="small">
        <ShrinkIcon size={24} />
      </IconButton>
    ),
  }[refType];
  /**
   * If treeNode is $ref type, create ref expand/shrink action
   * to be used to expand or collapse a row depending on the refType prop.
   * (will be applied to the first line of the row)
   */
  const onRefClick = {
    none: () => {},
    default: () =>
      setSchemaTree(prev => expandRefNode(prev, treeNode, references)),
    expanded: () => setSchemaTree(prev => shrinkRefNode(prev, treeNode)),
  }[refType];

  const isInteractive = refType !== 'none';
  const interactiveProps = isInteractive
    ? {
        onClick: onRefClick,
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onRefClick();
          }
        },
        role: 'button',
        tabIndex: 0,
      }
    : {};

  return (
    <div key={schemaType} {...interactiveProps}>
      <Typography
        component="div"
        variant="subtitle2"
        className={classNames(classes.typography, classes.indentation)}>
        {name && nameText}
        {typeSymbol}
        {requiredMark}
        {refButton}
      </Typography>
    </div>
  );
}

LeftCell.propTypes = {
  /**
   * Tree node object data structure.
   */
  treeNode: basicTreeNode.isRequired,
  /**
   * Identification of row's type. Can be one of the following:
   * 'none': the row is not a ref row, so no button is necessary.
   * 'default': the row is a ref row in collapsed form.
   *            A plus button will be displayed in order to expand the $ref.
   * 'expanded': the row is a ref row in expanded form.
   *             A minus button will be displayed in order to srhink the $ref.
   */
  refType: oneOf(['none', 'default', 'expanded']).isRequired,
  /**
   * The method to update the state of the schemaTree.
   * Only necessary for ref rows for expanding or shrinking a $ref.
   */
  setSchemaTree: func,
  /**
   * Object where all schemas are stored so that the table
   * can dereference $ref schemas by their '$id' as keys.
   * (ex. references['/schemas/example.json#'] = exampleJson schema)
   * Only necessary for ref rows.
   */
  references: object,
};

LeftCell.defaultProps = {
  setSchemaTree: NOOP,
  references: {},
};

export default React.memo(LeftCell);
