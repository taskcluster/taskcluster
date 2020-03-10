const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ purgeCache }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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
