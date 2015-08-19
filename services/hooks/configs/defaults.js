module.exports = {
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
