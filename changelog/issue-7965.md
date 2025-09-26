audience: general
level: minor
reference: issue 7965
---
GitHub service now validates webhook payloads against a schema to prevent TypeErrors from missing or malformed fields. This ensures that webhook handlers receive properly structured data, the webhook now returns a 400 status and does not create an unprocessable event.