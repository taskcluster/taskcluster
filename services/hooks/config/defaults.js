module.exports = {
    // Server configuration
    server:
    {
        // Public URL from which the server can be accessed
        publicUrl:  'https://cron.taskcluster.net',

        // Port to listen for requests on
        port:       undefined,

        // Environment 'development' or 'production'
        env:        'development',

        // Force SSL, not useful when running locally
        forceSSL:   false,

        // Trust a forwarding proxy
        trustProxy: false
    },

    // TaskCluster configuration
    taskcluster:
    {
        // BaseUrl for auth, if default built-in baseUrl isn't provided
        authBaseUrl:   undefined,

        // TaskCluster credentials for this sever, these must have scopes"
        // auth:credentials
        // (typically configured using environmental variables)
        credentials: {
            clientId:      undefined,
            accessToken:   undefined
        }
    }
};
