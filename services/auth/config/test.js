module.exports = {
  // Component specific configuration
  auth: {
    // Azure table for the client table
    clientTableName:                'TestClients',

    // Publish references and schemas
    publishMetaData:                'false',

    // Name of component in statistics
    statsComponent:                 'auth-tests',

    // root credentials artificially inserted when application is started
    root: {           // Credentials used for testing
      clientId:       'ctVNevJPRbe6ICL5-nhZkw',
      accessToken:    'EO-5D7oBTYWMTJ79HYGf-guFVXRtIbRKWoXOyb9EpkIQ'
    },
    azureAccounts:    "{\"testaccount\": \"blablablabla\"}"
  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'http://localhost:60550',

    // Port to listen for requests on
    port:                           60550,

    // Run in development mode (logging and error handling)
    development:                    true
  }
};