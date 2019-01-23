import React, { Component, Fragment } from 'react';
import { string, object, func } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Code from '@mozilla-frontend-infra/components/Code';
import { safeDump } from 'js-yaml';
import ErrorPanel from '../ErrorPanel';

@withStyles(theme => ({
  code: {
    maxHeight: '70vh',
    margin: 0,
  },
  codeEditor: {
    overflow: 'auto',
    maxHeight: '70vh',
  },
  description: {
    marginBottom: theme.spacing.triple,
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

  render() {
    const { classes, action, form, error } = this.props;
    const { name } = action;

    return (
      <Fragment>
        <ErrorPanel error={error} />
        <div className={classes.description}>
          <Typography gutterBottom>
            <Markdown>{action.description}</Markdown>
          </Typography>
          {action.kind === 'hook' && (
            <Typography gutterBottom>
              This action trigers hook{' '}
              <code>
                {action.hookGroupId}/{action.hookId}
              </code>
              .
            </Typography>
          )}
        </div>
        {action.schema && (
          <Grid container spacing={16}>
            <Grid item lg={6} md={6} sm={12}>
              <Typography gutterBottom variant="subtitle1">
                Action
              </Typography>
              <CodeEditor
                className={classes.codeEditor}
                mode="yaml"
                lint
                value={form}
                onChange={value => this.props.onFormChange(value, name)}
              />
            </Grid>
            <Grid item lg={6} md={6} sm={12}>
              <Typography gutterBottom variant="subtitle1">
                Schema
              </Typography>
              <Code language="yaml" className={classes.code}>
                {safeDump(action.schema || {})}
              </Code>
            </Grid>
          </Grid>
        )}
      </Fragment>
    );
  }
}
