import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '../../../components/Spinner';
import Code from '../../../components/Code';
import Dashboard from '../../../components/Dashboard';
import taskQuery from './task.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import { withAuth } from '../../../utils/Auth';

@withAuth
@withStyles(theme => ({
  rawDefinition: {
    bottom: theme.spacing(3),
    left: theme.spacing(1),
    right: theme.spacing(1),
  },
}))
@graphql(taskQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    variables: {
      taskId: props.match.params.taskId,
    },
  }),
})
export default class TaskDefinition extends Component {
  render() {
    const {
      classes,
      match,
      data: { task, error, loading },
    } = this.props;
    const { taskId } = match?.params;
    const { rawDefinition } = task || {};

    if (error) {
      return <ErrorPanel fixed error={error} />;
    }

    if (loading) {
      return <Spinner loading />;
    }

    return (
      <Dashboard
        title={`${taskId} Definition`}
        disableTitleFormatting
        disablePadding>
        <Code className={classes.rawDefinition} language="json">
          {JSON.stringify(rawDefinition, null, 2)}
        </Code>
      </Dashboard>
    );
  }
}
