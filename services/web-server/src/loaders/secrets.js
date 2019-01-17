import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ secrets }) => {
  const secretsList = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await secrets.list(options);
    const secretsList = raw.secrets.map(name => ({ name }));

    return {
      ...raw,
      items: filter ? sift(filter, secretsList) : secretsList,
    };
  });
  const secret = new DataLoader(names =>
    Promise.all(
      names.map(async name => {
        const secret = await secrets.get(name);

        return {
          name,
          ...secret,
        };
      })
    )
  );

  return {
    secrets: secretsList,
    secret,
  };
};
