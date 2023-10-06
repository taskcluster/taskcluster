import sift from '../utils/sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ notify }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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
