import sift from '../utils/sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ purgeCache }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const cachePurges = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await purgeCache.allPurgeRequests(options);

    return {
      ...raw,
      items: sift(filter, raw.requests),
    };
  });

  return {
    cachePurges,
  };
};
