import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ purgeCache }) => {
  const cachePurges = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await purgeCache.allPurgeRequests(options);

    return {
      ...raw,
      items: filter ? sift(filter, raw.requests) : raw.requests,
    };
  });

  return {
    cachePurges,
  };
};
