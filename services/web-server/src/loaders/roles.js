import DataLoader from 'dataloader';
import sift from 'sift';

export default ({ auth }) => {
  const roles = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const roles = await auth.listRoles();

        return filter ? sift(filter, roles) : roles;
      })
    )
  );
  const role = new DataLoader(roleIds =>
    Promise.all(roleIds.map(roleId => auth.role(roleId)))
  );

  return {
    roles,
    role,
  };
};
