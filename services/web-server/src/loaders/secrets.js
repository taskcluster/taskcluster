import DataLoader from 'dataloader';
import sift from '../utils/sift.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ secrets }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const secretsList = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await secrets.list(options);
    const secretsList = raw.secrets.map(name => ({ name }));

    return {
      ...raw,
      items: sift(filter, secretsList),
    };
  });
  const secret = new DataLoader(names =>
    Promise.all(
      names.map(async name => {
        try {
          const secret = await secrets.get(name);

          return {
            name,
            ...secret,
          };
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    secrets: secretsList,
    secret,
  };
};
