export default class Connection {
  constructor(options) {
    this.pageInfo = {
      hasNextPage: !!options.continuationToken,
      hasPreviousPage: !!options.previousContinuationToken,
    };

    if (options.previousContinuationToken) {
      this.pageInfo.startCursor = options.previousContinuationToken;
    }

    if (options.continuationToken) {
      this.pageInfo.endCursor = options.continuationToken;
    }

    this.edges = options.items.map(item => ({
      cursor: options.continuationToken || null,
      node: item,
    }));
  }
}
