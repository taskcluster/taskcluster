import { GraphQLDate, GraphQLDateTime, GraphQLTime } from 'graphql-iso-date';
import GraphQLJSON from 'graphql-type-json';

export const typeDefs = `
  scalar Date
  scalar Time
  scalar DateTime
  scalar JSON
  
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }
  
  input PageConnection {
    limit: Int
    startCursor: String
    endCursor: String
  }

  type Query {
    name: String
  }
  
  type Mutation {
    name: String
  }
  
  schema {
    query: Query
    mutation: Mutation
  }
`;

export const resolvers = {
  Date: GraphQLDate,
  Time: GraphQLTime,
  DateTime: GraphQLDateTime,
  JSON: GraphQLJSON,
};
