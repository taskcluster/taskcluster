const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');
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
    const provisioners = siftUtil(filter, raw.provisioners);

    return { ...raw, items: provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
