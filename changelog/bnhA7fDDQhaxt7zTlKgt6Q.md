level: patch
---
Third-Party Logins now correctly intersect the requested scopes with the user's *expanded* scopes.
Previous versions would result in a client with an empty set of scopes, when the required scopes were associated with a role given to the user.
