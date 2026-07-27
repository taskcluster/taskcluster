import React, { createContext, useContext } from 'react';

const missingClientFactory = () => {
  throw new Error('Taskcluster client factory is not available');
};

export const TaskclusterClientContext = createContext(missingClientFactory);

export const withTaskclusterClient = UnconnectedComponent =>
  function TaskclusterClientComponent(props) {
    const createTaskclusterClient = useContext(TaskclusterClientContext);

    return (
      <UnconnectedComponent
        {...props}
        createTaskclusterClient={createTaskclusterClient}
      />
    );
  };
