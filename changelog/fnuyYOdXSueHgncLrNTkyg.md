audience: users
level: patch
---
When `githubRepoToken` fails because the github app isn't installed on the requested owner, the error now includes the github app's slug. Rate limit errors also include it when it's already known.
