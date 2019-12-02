import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import ShellConsole from '../../components/Shell';
import Dashboard from '../../components/Dashboard';

@withStyles({
  main: {
    padding: 0,
    position: 'relative',
  },
})
export default class Shell extends Component {
  render() {
    const search = new URLSearchParams(this.props.location.search);
    const props = ['socketUrl', 'v', 'taskId'].reduce(
      (props, key) => ({
        ...props,
        [key]: decodeURIComponent(search.get(key)),
      }),
      {}
    );

    return (
      <Dashboard
        disableAppbar
        className={this.props.classes.main}
        title="Shell">
        <ShellConsole
          url={props.socketUrl}
          taskId={props.taskId}
          version={props.v}
        />
      </Dashboard>
    );
  }
}
