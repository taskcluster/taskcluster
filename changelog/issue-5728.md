audience: general
level: minor
reference: issue 5728
---

Changed the way that github events are being handled.
There was a problem with treating those callbacks in async manner which resulted in total messages being processed to be limited by consumer's "prefetch" count (5 by default). And resulted in messages being piled up.
Introduces extra monitoring information with the numbers of active handlers count and total messages processed.
