audience: users
level: patch
reference: issue 3767
---
This version adjusts the Python client requirements to avoid `aiohttp==3.7.0`, which has a [serious bug preventing use of HTTPS](https://github.com/aio-libs/aiohttp/issues/5110).
