level: major
---
The web-server application no longer generates a JWT when logging in. It uses a session secret.
The environment variable `JWT_KEY` can be removed. The following configuration variables are now required
when logging in:

* `SESSION_SECRET` - required to compute the session hash
* `AZURE_ACCOUNT_ID` - Azure account id
* `AZURE_ACCOUNT_KEY` - Azure access key
* `AZURE_TABLE_NAME` - table to store user sessions 
