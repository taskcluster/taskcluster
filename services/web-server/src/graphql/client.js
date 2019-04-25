const { graphql: client } = require('graphql');

// A GraphQL client for the server
module.exports = ({ context, schema }) =>
  ({ requestString, rootValue, variableValues, operationName }) =>
    client(schema, requestString, rootValue, context, variableValues, operationName);
