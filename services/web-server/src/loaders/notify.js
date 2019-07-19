const sift = require('../utils/sift');
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
      items: sift(filter, addresses),
    };
  });

  return {
    listDenylistAddresses,
  };
};
