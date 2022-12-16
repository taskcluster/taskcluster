import React from 'react';
import { useQuery } from 'react-apollo';
import StatusDashboard from '.';
import clientsQuery from './clients.graphql';
import hooksQuery from './hooks.graphql';
import provisionersQuery from './provisioners.graphql';
import rolesQuery from './roles.graphql';
import secretsQuery from './secrets.graphql';
import wmPoolsQuery from './wmPools.graphql';

export default function StatsFetcher() {
  const workerPools = useQuery(wmPoolsQuery);
  const provisioners = useQuery(provisionersQuery);
  const hookGroups = useQuery(hooksQuery);
  const clients = useQuery(clientsQuery);
  const roles = useQuery(rolesQuery);
  const secrets = useQuery(secretsQuery);

  return (
    <StatusDashboard
      workerPools={workerPools}
      provisioners={provisioners}
      hookGroups={hookGroups}
      clients={clients}
      secrets={secrets}
      roles={roles}
    />
  );
}
