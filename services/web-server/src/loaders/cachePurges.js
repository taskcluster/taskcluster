import ConnectionLoader from '../ConnectionLoader.js';

export default ({ purgeCache }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const cachePurges = new ConnectionLoader(async ({ options }) => {
    const raw = await purgeCache.allPurgeRequests(options);

    return {
      ...raw,
      items: raw.requests,
    };
  });

  return {
    cachePurges,
  };
};
