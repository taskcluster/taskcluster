const DataLoader = require('dataloader');
const sift = require('sift').default;
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ queue }) => {
  const provisioner = new DataLoader(provisionerIds =>
    Promise.all(
      provisionerIds.map(async provisionerId =>
        queue.getProvisioner(provisionerId)
      )
    )
  );
  const provisioners = new ConnectionLoader(async ({ options, filter }) => {
    const raw = await queue.listProvisioners(options);
    const provisioners = filter
      ? sift(filter, raw.provisioners)
      : raw.provisioners;

    return { ...raw, items: provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
