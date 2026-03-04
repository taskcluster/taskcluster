import { DateResolver, DateTimeResolver, TimeResolver } from 'graphql-scalars';
import GraphQLJSON from 'graphql-type-json';

export default {
  Date: DateResolver,
  Time: TimeResolver,
  DateTime: DateTimeResolver,
  JSON: GraphQLJSON,
};
