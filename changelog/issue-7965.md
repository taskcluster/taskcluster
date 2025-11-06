audience: general
level: major
reference: issue 7965
---
GitHub service now validates webhook payloads against a schema to prevent TypeErrors from missing or malformed fields. This ensures that webhook handlers receive properly structured data, the webhook now returns a 400 status and does not create an unprocessable event.

The `githubWebHookConsumer` endpoint has been removed from client libraries as it was not intended for client use (only for GitHub webhook integrations).
