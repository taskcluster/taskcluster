const { DateResolver, DateTimeResolver, TimeResolver } = require('graphql-scalars');
const GraphQLJSON = require('graphql-type-json');

module.exports = {
  Date: DateResolver,
  Time: TimeResolver,
  DateTime: DateTimeResolver,
  JSON: GraphQLJSON,
};
