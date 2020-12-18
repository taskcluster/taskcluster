audience: users
level: patch
reference: issue 4057
---
All clients (JS, Python, Go, Web, Shell) now fail when an API method results in a redirect, rather than following that redirect.  The API methods that return redirects are those related to Taskcluster artifacts, and these methods must be accessed by building and fetching a signed URL.
