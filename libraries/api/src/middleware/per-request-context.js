/**
 * If a bit of context supports per-request configuration, we
 * make sure to set that up here
 */
const perRequestContext = ({entry, context}) => {
  return (req, res, next) => {
    const cache = {};
    req.tcContext = new Proxy(context, {
      get(target, prop) {
        const val = target[prop];
        if (val.taskclusterPerRequestInstance === undefined) {
          return val;
        }
        if (cache[prop]) {
          return cache[prop];
        }
        cache[prop] = val.taskclusterPerRequestInstance({
          entryName: entry.name,
          traceId: req.traceId,
          requestId: req.requestId,
        });
        return cache[prop];
      },
      set(target, prop, value) {
        throw new Error('Cannot set values in context inside a handler!');
      },
      deleteProperty(target, prop) {
        throw new Error('Cannot delete values in context inside a handler!');
      },
    });

    next();
  };
};

exports.perRequestContext = perRequestContext;
