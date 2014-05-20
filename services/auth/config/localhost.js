module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'TestClients',

    // Publish references and schemas
    publishMetaData:                'false'
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://localhost:5050',

    // Port to listen for requests on
    port:                           5050,

    // Run in development mode (logging and error handling)
    development:                    true
  }
};