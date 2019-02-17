import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ notify }) => {
  const denylist = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await notify.list(options);
    const addresses = raw.addresses.map(address => {
      return {
        notificationType: address.notificationType,
        notificationAddress: address.notificationAddress,
      };
     });

    return {
      ...raw,
      items: filter ? sift(filter, addresses) : addresses,
    };
  });

  return {
    denylist
  };
};
