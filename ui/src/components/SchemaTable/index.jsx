import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { string } from 'prop-types';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Table from 'material-ui-json-schema-viewer/build/SchemaViewer';
import jsonSchemaDraft06 from 'ajv/lib/refs/json-schema-draft-06.json';
import jsonSchemaDraft07 from 'ajv/lib/refs/json-schema-draft-07.json';
import ErrorPanel from '../ErrorPanel';
import { THEME } from '../../utils/constants';
import references from '../../../../generated/references.json';

// Local copies of the json-schemas schemas, since TC schemas $refer to these
const EXTERNAL_SCHEMAS = [jsonSchemaDraft06, jsonSchemaDraft07].reduce(
  (schemas, schema) => ({ ...schemas, [schema.$id]: schema }),
  {}
);

@withRouter
@withStyles(
  theme => {
    const borderColor =
      theme.palette.type === 'dark'
        ? THEME.TEN_PERCENT_WHITE
        : THEME.TEN_PERCENT_BLACK;

    return {
      schemaTable: {
        fontSize: 16,
        overflowX: 'auto',
        '& pre': {
          background:
            theme.palette.type === 'dark'
              ? `${THEME.TEN_PERCENT_WHITE} !important`
              : `${THEME.TEN_PERCENT_BLACK} !important`,
        },
        /* eslint-disable no-dupe-keys */
        // Copied from https://github.com/twbs/bootstrap/blob/f7e8445f72875a49a909dc0af8e4cf43f19f535e/dist/css/bootstrap.css#L1515-L1536
        '& .table': {
          width: '100%',
          marginBottom: '1rem',
        },
        '& .table th, & .table td': {
          padding: '0.75rem',
          verticalAlign: 'top',
          borderTop: `1px solid ${borderColor}`,
        },
        '& .table thead th': {
          verticalAlign: 'bottom',
          borderBottom: `2px solid ${borderColor}`,
          '& table tbody + tbody': {
            borderTop: `2px solid ${borderColor}`,
          },
        },
        '& .table': {
          width: '100%',
          marginBottom: '1rem',
        },
        '& .table th, & .table td': {
          padding: '0.75rem',
          verticalAlign: 'top',
          borderTop: `1px solid ${borderColor}`,
        },
        '& .table thead th': {
          verticalAlign: 'bottom',
          borderBottom: `2px solid ${borderColor}`,
          '& table tbody + tbody': {
            borderTop: `2px solid ${borderColor}`,
          },
        },
        // Copied from https://github.com/twbs/bootstrap/blob/f7e8445f72875a49a909dc0af8e4cf43f19f535e/dist/css/bootstrap.css#L1547-L1559
        '& .table-bordered': {
          border: `1px solid ${borderColor}`,
        },
        '& .table-bordered th': {
          border: `1px solid ${borderColor}`,
        },
        '& .table-bordered thead th, & .table-bordered thead td': {
          borderBottomWidth: 2,
        },
        /* eslint-enable no-dupe-keys */
      },
    };
  },
  { withTheme: true }
)
/**
 * Display a SchemaTable
 */
export default class SchemaTable extends Component {
  static propTypes = {
    // The $id of the schema to render
    schema: string.isRequired,
  };

  state = {
    schema: null,
    references: [],
    error: null,
  };

  async componentDidMount() {
    const { schema } = this.props;

    /**
     * Fetch schema content by $id and update state
     */
    if (!this.state.schema && schema) {
      try {
        const schemaContent = await this.getSchemaContent(schema);

        this.setState({
          schema: schemaContent,
        });
      } catch (error) {
        this.setState({ error });
      }
    }

    /**
     *
     */
    try {
      const schemaReferences = await this.getSchemaReferences();

      this.setState({
        references: schemaReferences,
      });
    } catch (error) {
      this.setState({ error });
    }
  }

  async getSchemaContent(schemaPath) {
    const external = EXTERNAL_SCHEMAS[schemaPath];

    if (external) {
      return external;
    }

    const schema = references.find(({ content }) => content.$id === schemaPath);

    if (!schema) {
      throw new Error(`Cannot find ${schemaPath}.`);
    }

    return schema.content;
  }

  async getSchemaReferences() {
    const schemaReferences = references.map(schema => schema.content);

    Object.values(EXTERNAL_SCHEMAS).forEach(schema => {
      schemaReferences.push(schema);
    });

    return schemaReferences;
  }

  render() {
    const { classes } = this.props;
    const { error, schema, references } = this.state;

    if (error) {
      return <ErrorPanel error={error} />;
    }

    return schema ? (
      <div className={classes.schemaTable}>
        <Table schema={schema} references={references} />
      </div>
    ) : (
      <Spinner loading />
    );
  }
}
