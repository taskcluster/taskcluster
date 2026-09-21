import React, { Component } from 'react';
import { Queue } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '../../../components/Spinner';
import JsonDisplay from '../../../components/JsonDisplay';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import withResource from '../../../hocs/withResource';

@withStyles(theme => ({
  rawDefinition: {
    bottom: theme.spacing(3),
    left: theme.spacing(1),
    right: theme.spacing(1),
  },
}))
@withTaskclusterClient
@withResource({
  fetch: props => {
    return () => {
      return props
        .createTaskclusterClient({ Class: Queue })
        .task(props.match.params.taskId);
    };
  },
  key: props => {
    return props.match.params.taskId;
  },
})
export default class TaskDefinition extends Component {
  render() {
    const { classes, match, data: rawDefinition, error, loading } = this.props;
    const { taskId } = match.params;

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
        <JsonDisplay
          className={classes.rawDefinition}
          syntax="yaml"
          objectContent={rawDefinition}
        />
      </Dashboard>
    );
  }
}
