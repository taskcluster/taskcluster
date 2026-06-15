import ConnectionLoader from '../ConnectionLoader.js';

export default ({ purgeCache }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
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
