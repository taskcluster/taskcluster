audience: users
level: major
reference: issue 4058
---
The `queue.getArtifact` and `queue.getLatestArtifact` methods now also return a JSON body containing the URL from which the artifact can be downlodaed, in addition to the existing behavior, returning a 303 redirect.

This is a major change only because it changes the function signatures in the Go client.
