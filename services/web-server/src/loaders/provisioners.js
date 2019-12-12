const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ queue }) => {
  const provisioner = new DataLoader(provisionerIds =>
    Promise.all(
      provisionerIds.map(async provisionerId => {
        try {
          return await queue.getProvisioner(provisionerId);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const provisioners = new ConnectionLoader(async ({ options, filter }) => {
    const raw = await queue.listProvisioners(options);
    const provisioners = sift(filter, raw.provisioners);

    return { ...raw, items: provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
