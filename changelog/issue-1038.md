level: major
---
The web-server application no longer generates a JWT when logging in. It uses a sessions to keep track of users.
The environment variable `JWT_KEY` can be removed. When logging in production, sessions will be stored in an azure table.
The following configuration variables are now required when logging in:

* `SESSION_SECRET` - required to compute the session hash
* `AZURE_ACCOUNT_ID` (in production only) - Azure account id
* `AZURE_ACCOUNT_KEY` (in production only) - Azure access key
* `AZURE_TABLE_NAME` (in production only) - table to store user sessions 
