const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ notify }) => {
  const listDenylistAddresses = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await notify.listDenylist(options);
    const addresses = raw.addresses.map(address => {
      return {
        notificationType: address.notificationType,
        notificationAddress: address.notificationAddress,
      };
    });

    return {
      ...raw,
      items: siftUtil(filter, addresses),
    };
  });

  return {
    listDenylistAddresses,
  };
};
