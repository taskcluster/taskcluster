import { differenceInDays } from 'date-fns';
import format from './format';

const ACTIVE_DAYS = 7;

export default (clients, roles, secrets) => {
  let clientsCount = 0;
  let clientsRecent = 0;
  let rolesCount = 0;
  let secretsCount = 0;
  const now = new Date();

  if (!roles.error && !roles.loading) {
    rolesCount = (roles?.data?.listRoleIds?.edges || []).length;
  }

  if (!secrets.error && !secrets.loading) {
    secretsCount = (secrets?.data?.secrets?.edges || []).length;
  }

  if (!clients.error && !clients.loading) {
    (clients?.data?.clients?.edges || []).forEach(({ node }) => {
      if (!node) {
        return;
      }

      clientsCount += 1;

      if (differenceInDays(now, new Date(node.lastDateUsed)) <= ACTIVE_DAYS) {
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
