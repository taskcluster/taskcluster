import { type ComponentType, createContext, useContext } from 'react';

export type TaskclusterClientFactory = <T>(options: {
  Class: new (...args: never[]) => T;
  [option: string]: unknown;
}) => T;

const missingClientFactory: TaskclusterClientFactory = () => {
  throw new Error('Taskcluster client factory is not available');
};

export const TaskclusterClientContext =
  createContext<TaskclusterClientFactory>(missingClientFactory);

export const useTaskclusterClient = () => useContext(TaskclusterClientContext);

export interface WithTaskclusterClientProps {
  createTaskclusterClient: TaskclusterClientFactory;
}

export const withTaskclusterClient = <P extends WithTaskclusterClientProps>(
  UnconnectedComponent: ComponentType<P>
) =>
  function TaskclusterClientComponent(
    props: Omit<P, keyof WithTaskclusterClientProps>
  ) {
    const createTaskclusterClient = useTaskclusterClient();

    return (
      <UnconnectedComponent
        {...(props as P)}
        createTaskclusterClient={createTaskclusterClient}
      />
    );
  };
