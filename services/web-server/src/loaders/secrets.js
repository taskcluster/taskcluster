const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ secrets }) => {
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
