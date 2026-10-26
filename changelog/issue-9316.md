audience: users
level: patch
reference: issue 9316
---
web-server's pulse subscriptions now recover automatically when RabbitMQ cancels the consumer, and client disconnects are no longer reported as errors.
