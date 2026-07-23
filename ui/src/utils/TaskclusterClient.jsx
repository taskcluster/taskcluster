import React, { Component, createContext } from 'react';

const missingClientFactory = () => {
  throw new Error('Taskcluster client factory is not available');
};

export const TaskclusterClientContext = createContext(missingClientFactory);

export const withTaskclusterClient = UnconnectedComponent =>
  class TaskclusterClientComponent extends Component {
    render() {
      return (
        <TaskclusterClientContext.Consumer>
          {createTaskclusterClient => (
            <UnconnectedComponent
              {...this.props}
              createTaskclusterClient={createTaskclusterClient}
            />
          )}
        </TaskclusterClientContext.Consumer>
      );
    }
  };
