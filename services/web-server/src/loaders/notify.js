import substringFilter from '../utils/searchFilter.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ notify }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
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
