const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ purgeCache }) => {
  const cachePurges = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await purgeCache.allPurgeRequests(options);

    return {
      ...raw,
      items: siftUtil(filter, raw.requests),
    };
  });

  return {
    cachePurges,
  };
};
