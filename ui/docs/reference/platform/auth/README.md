# Auth Service

The auth service manages permissions and credentials in a Taskcluster deployment.
This involves managing [clients](clients) and [roles](roles) and validating access to API methods.

Note that in this service "authentication" refers to validating the correctness of the supplied credentials (that the caller posesses the appropriate access token).
This service does not provide any kind of user authentication (identifying a particular person).
