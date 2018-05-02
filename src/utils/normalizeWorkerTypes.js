import { find, propEq } from 'ramda';

const normalizeWorkerTypes = (connection, workerTypeSummaries) =>
  workerTypeSummaries
    ? {
        ...connection,
        edges: connection.edges.map(edge => ({
          ...edge,
          ...(workerTypeSummaries
            ? {
                node: {
                  ...edge.node,
                  ...find(propEq('workerType', edge.node.workerType))(
                    workerTypeSummaries
                  ),
                },
              }
            : null),
        })),
      }
    : connection;

export default normalizeWorkerTypes;
