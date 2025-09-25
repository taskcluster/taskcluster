audience: general
level: minor
reference: issue 7965
---
The GitHub service now validates incoming webhook payloads against JSON schemas to prevent errors from malformed or unexpected event structures. This validation can be controlled via feature flags `WEBHOOK_VALIDATION_ENABLED` and `WEBHOOK_VALIDATION_BLOCK` for gradual rollout. The validation prevents TypeErrors that could occur when GitHub sends webhooks with null or missing fields, improving service reliability.
