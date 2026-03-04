import React, { useEffect, useRef } from 'react';
import { useQuery } from 'react-apollo';
import StatusDashboard from '.';
import clientsQuery from './clients.graphql';
import hooksQuery from './hooks.graphql';
import provisionersQuery from './provisioners.graphql';
import rolesQuery from './roles.graphql';
import secretsQuery from './secrets.graphql';
import wmPoolsQuery from './wmPools.graphql';
import wmPoolsErrorsQuery from './wmPoolsErrors.graphql';

export default function StatsFetcher() {
  // TODO graphql does extra call to each worker pool to fetch pending counts
  // that are later summed up. should be done server-side in 1 call
  const workerPools = useQuery(wmPoolsQuery);
  const provisioners = useQuery(provisionersQuery);
  const hookGroups = useQuery(hooksQuery);
  const clients = useQuery(clientsQuery);
  const roles = useQuery(rolesQuery);
  const secrets = useQuery(secretsQuery);
  const wmStats = useQuery(wmPoolsErrorsQuery);
  const refreshInterval = 30 * 1000;
  const intervalRef = useRef();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      workerPools.refetch();
    }, refreshInterval);

    return () => clearInterval(intervalRef.current);
  }, [workerPools, refreshInterval]);

  return (
    <StatusDashboard
      workerPools={workerPools}
      provisioners={provisioners}
      hookGroups={hookGroups}
      clients={clients}
      secrets={secrets}
      roles={roles}
      wmStats={wmStats}
    />
  );
}
