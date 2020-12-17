audience: users
level: patch
reference: issue 4056
---
The taskcluster-proxy no longer follows redirects.  In practice, this is only an issue when calling the artifact-related API methods that return a redirect to the artifact content.  The proxy will now return the redirect response unchanged.
