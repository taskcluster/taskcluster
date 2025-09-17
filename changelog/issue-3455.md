level: patch
audience: developers
reference: issue 3455
---
The GitHub service now properly validates pull request events at the webhook entry point and rejects events with incomplete repository data. The validation checks for missing `head.repo`, `base.repo`, `head.sha`, `head.repo.name`, and `head.repo.clone_url` fields. When any of these required fields are missing (e.g., when a fork is deleted or made private), the webhook now returns a 400 status and does not create an unprocessable event. This prevents TypeErrors in downstream handlers that expect valid repository data for checkout operations. Additionally, unnecessary validation checks for database-retrieved values have been removed since the schema already enforces NOT NULL constraints on these fields.
