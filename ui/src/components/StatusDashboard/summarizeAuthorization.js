import { differenceInDays } from 'date-fns';
import format from './format';

const ACTIVE_DAYS = 7;

export default (clients, roles, secrets) => {
  let clientsCount = 0;
  let clientsRecent = 0;
  let rolesCount = 0;
  let secretsCount = 0;
  const now = new Date();

  // `data` is the full list from each service: role ids from
  // `auth.listRoleIds`, secret names from `secrets.list`, and client objects
  // from `auth.listClients`.
  if (!roles.error && !roles.loading) {
    rolesCount = (roles?.data || []).length;
  }

  if (!secrets.error && !secrets.loading) {
    secretsCount = (secrets?.data || []).length;
  }

  if (!clients.error && !clients.loading) {
    (clients?.data || []).forEach(client => {
      if (!client) {
        return;
      }

      clientsCount += 1;

      if (differenceInDays(now, new Date(client.lastDateUsed)) <= ACTIVE_DAYS) {
        clientsRecent += 1;
      }
    });
  }

  return [
    {
      title: 'Total Clients',
      value: format(clientsCount),
      link: '/auth/clients',
      error: clients.error?.message,
      loading: clients.loading,
    },
    {
      title: 'Active Clients',
      hint: `Clients that were active in the last ${ACTIVE_DAYS} days`,
      value: format(clientsRecent),
      link: '/auth/clients',
      error: clients.error?.message,
      loading: clients.loading,
    },
    {
      title: 'Roles',
      value: format(rolesCount),
      link: '/auth/roles',
      error: roles.error?.message,
      loading: roles.loading,
    },
    {
      title: 'Secrets',
      value: format(secretsCount),
      link: '/secrets',
      error: secrets.error?.message,
      loading: secrets.loading,
    },
  ];
};
