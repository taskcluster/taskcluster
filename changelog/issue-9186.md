level: patch
audience: developers
reference: issue 9186
---
The UI now fetches user credentials and login status from the new web-server
REST endpoints `POST /login/credentials` and `GET /login/is-logged-in`, which
are authenticated by the session cookie. The `getCredentials` and `isLoggedIn`
GraphQL queries have been removed.
