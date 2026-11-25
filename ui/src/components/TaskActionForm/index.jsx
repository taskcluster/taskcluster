import React, { Component, Fragment } from 'react';
import { string, object, func } from 'prop-types';
import withStyles from '../../utils/withStyles';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import CodeEditor from '../CodeEditor';
import JsonDisplay from '../JsonDisplay';
import ErrorPanel from '../ErrorPanel';
import Markdown from '../Markdown';

@withStyles(theme => ({
  panels: {
    [theme.breakpoints.up('md')]: {
      flex: 1,
      minHeight: 400,
    },
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {
      height: '100%',
    },
  },
  panelContent: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    margin: 0,
  },
  description: {
    marginBottom: theme.spacing(3),
  },
}))
export default class TaskActionForm extends Component {
  static defaultProps = {
    error: null,
  };

  static propTypes = {
    // TODO: Replace with taskAction
    action: object.isRequired,
    /** Action input form. */
    form: string.isRequired,
    onFormChange: func.isRequired,
    /** An error object to display. */
    error: object,
  };

  handleFormChange = value => {
    this.props.onFormChange(value, this.props.action.name);
  };

  render() {
    const { classes, action, form, error } = this.props;

    return (
      <Fragment>
        <ErrorPanel error={error} />
        <div className={classes.description}>
          <Typography variant="body2" gutterBottom>
            <Markdown>{action.description}</Markdown>
          </Typography>
          {action.kind === 'hook' && (
            <Typography variant="body2" gutterBottom>
              This action triggers hook{' '}
              <code>
                {action.hookGroupId}/{action.hookId}
              </code>
              .
            </Typography>
          )}
        </div>
        {action.schema && (
          <Grid container spacing={2} className={classes.panels}>
            <Grid size={{ sm: 12, md: 6, lg: 6 }} className={classes.panel}>
              <Typography gutterBottom variant="subtitle1">
                Action
              </Typography>
              <CodeEditor
                className={classes.panelContent}
                mode="yaml"
                lint
                value={form}
                onChange={this.handleFormChange}
              />
            </Grid>
            <Grid size={{ sm: 12, md: 6, lg: 6 }} className={classes.panel}>
              <Typography gutterBottom variant="subtitle1">
                Schema
              </Typography>
              <JsonDisplay
                syntax="yaml"
                className={classes.panelContent}
                objectContent={action.schema || {}}
              />
            </Grid>
          </Grid>
        )}
      </Fragment>
    );
  }
}
