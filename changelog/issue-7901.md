audience: worker-deployers
level: silent
reference: issue 7901
---
The generic-worker now logs a message when it receives SIGINT (Ctrl+C), making it
clear that the signal was received and the worker is exiting. Previously, no message was logged,
leaving users unsure whether the signal had been received.
