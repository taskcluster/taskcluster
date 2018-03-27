import { graphqlExpress } from 'apollo-server-express';
import formatError from './formatError';

export default ({ schema, tracing, cacheControl, context }) =>
  graphqlExpress(async request => ({
    schema,
    tracing,
    cacheControl,
    formatError,
    context: await context({ request }),
  }));
