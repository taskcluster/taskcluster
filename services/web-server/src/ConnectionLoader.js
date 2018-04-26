import DataLoader from 'dataloader';

const LIMIT = 100;
const FIRST = '$$FIRST$$';

export default class ConnectionLoader {
  constructor(singleConnectionHandler) {
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
            ? await singleConnectionHandler({ ...props, connection, options })
            : await singleConnectionHandler({ ...props, options });

          return this.createPageConnection(result, {
            ...connection,
            ...options,
          });
        })
      )
    );
  }

  createPageConnection({ continuationToken, items, ...props }, options) {
    const pageInfo = {
      hasNextPage: !!continuationToken,
      hasPreviousPage: !!options.cursor && options.cursor !== FIRST,
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
