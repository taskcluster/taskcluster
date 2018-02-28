import DataLoader from 'dataloader';

const LIMIT = 100;

export default class ConnectionLoader {
  constructor(singleConnectionHandler) {
    return new DataLoader(connections =>
      Promise.all(
        connections.map(async ({ connection, ...props }) => {
          const limit =
            connection && connection.limit
              ? connection.limit > LIMIT ? LIMIT : connection.limit
              : LIMIT;
          const continuationToken = connection
            ? connection.startCursor || connection.endCursor
            : null;
          const options = continuationToken
            ? { limit, continuationToken }
            : { limit };
          const result = connection
            ? await singleConnectionHandler({ ...props, connection, options })
            : await singleConnectionHandler({ ...props, options });

          return this.createPageConnection(result, options);
        })
      )
    );
  }

  createPageConnection({ continuationToken, items, ...props }, options) {
    const pageInfo = {
      hasNextPage: !!continuationToken,
      hasPreviousPage: !!options.continuationToken,
    };

    if (pageInfo.hasPreviousPage) {
      pageInfo.startCursor = options.continuationToken;
    }

    if (pageInfo.hasNextPage) {
      pageInfo.endCursor = continuationToken;
    }

    const edges = items.map(item => ({
      cursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
      node: item,
    }));

    return {
      ...props,
      pageInfo,
      edges,
    };
  }
}
