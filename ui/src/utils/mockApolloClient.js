import { ApolloClient, InMemoryCache } from '@apollo/client';
import { SchemaLink } from '@apollo/client/link/schema';
import { addMocksToSchema } from '@graphql-tools/mock';
import { makeExecutableSchema } from '@graphql-tools/schema';

export default function setupClient(mockResolvers, typeDefs) {
  return function createClient(overwriteMocks = {}) {
    const schema = addMocksToSchema({
      schema: makeExecutableSchema({ typeDefs }),
      mocks: { ...mockResolvers, ...overwriteMocks },
    });

    return new ApolloClient({
      cache: new InMemoryCache(),
      link: new SchemaLink({ schema }),
    });
  };
}
