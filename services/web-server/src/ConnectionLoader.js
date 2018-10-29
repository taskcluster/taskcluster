import DataLoader from 'dataloader';

const LIMIT = 1000;
const FIRST = '$$FIRST$$';

export default class ConnectionLoader {
  constructor(singleConnectionHandler) {
    const fetch = async ({ connection, options, ...props }) => {
      const result = connection
        ? await singleConnectionHandler({ connection, options, ...props })
        : await singleConnectionHandler({ options, ...props });

      if (result.continuationToken && !result.items.length) {
        return fetch({
          ...props,
          options: {
            ...options,
            continuationToken: result.continuationToken,
          },
        });
      }

      return result;
    };

    return new DataLoader(connections =>
      Promise.all(
        connections.map(async ({ connection, ...props }) => {
          const limit =
            connection && connection.limit
              ? connection.limit > LIMIT
                ? LIMIT
                : connection.limit
              : LIMIT;
          const continuationToken =
            connection && connection.cursor !== FIRST
              ? connection.cursor
              : null;
          const options = continuationToken
            ? { limit, continuationToken }
            : { limit };
          const result = connection
            ? await fetch({ ...props, connection, options })
            : await fetch({ ...props, options });
          const pageConnection = this.createPageConnection(result, {
            ...connection,
            ...options,
          });

          return pageConnection;
        })
      )
    );
  }

  createPageConnection({ continuationToken, items, ...props }, options) {
    const pageInfo = {
      hasNextPage: Boolean(continuationToken),
      hasPreviousPage: Boolean(options.cursor) && options.cursor !== FIRST,
      cursor: options.continuationToken || FIRST,
    };

    if (pageInfo.hasPreviousPage) {
      pageInfo.previousCursor = options.previousCursor;
    }

    if (pageInfo.hasNextPage) {
      pageInfo.nextCursor = continuationToken;
    }

    const edges = items.map(item => ({
      cursor: options.continuationToken,
      node: item,
    }));

    return {
      ...props,
      pageInfo,
      edges,
    };
  }
}
