audience: worker-deployers
level: patch
reference: issue 7012
---
Generic Worker retains the interactive username it determines inside WaitForLoginCompletion (by returning it) to avoid needing to re-determine it later. The intention is to reduce intermittent errors caused by the underlying method to determine the interactive username itself intermittently failing. So long as the interactive username can be determined just once during the specidied timeout period, the value can be retained and used when required.
