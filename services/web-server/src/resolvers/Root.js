const { GraphQLDate, GraphQLDateTime, GraphQLTime } = require('graphql-iso-date');
const GraphQLJSON = require('graphql-type-json');

module.exports = {
  Date: GraphQLDate,
  Time: GraphQLTime,
  DateTime: GraphQLDateTime,
  JSON: GraphQLJSON,
};
