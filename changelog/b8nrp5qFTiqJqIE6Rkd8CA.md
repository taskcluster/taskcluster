audience: deployers
level: patch
---
The object service now defaults to 1 replica, not 0.  The service will not start if it is not properly configured, and we recommend setting the service up at this time, as in the next major release workers will begin uploading objects to the queue.
