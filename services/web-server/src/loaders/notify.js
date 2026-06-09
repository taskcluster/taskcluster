import substringFilter from '../utils/searchFilter.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ notify }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const listDenylistAddresses = new ConnectionLoader(async ({ searchTerm, options }) => {
    const raw = await notify.listDenylist(options);
    const addresses = raw.addresses.map(address => {
      return {
        notificationType: address.notificationType,
        notificationAddress: address.notificationAddress,
      };
    });

    return {
      ...raw,
      items: substringFilter(searchTerm, 'notificationAddress', addresses),
    };
  });

  return {
    listDenylistAddresses,
  };
};
