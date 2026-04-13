audience: deployers
level: patch
reference: issue 8470
---
The worker-manager scanner now guards against overlapping scan loops and adds a per-worker timeout to `checkWorker` calls. Previously, when a scan exceeded `maxIterationTime` (common with large Azure worker pools), `lib-iterate` would start a new iteration while the old one was still running, resetting shared state and causing crashes in provider `checkWorker` methods. The scanner now detects loop overlap to prevent silent state corruption, and times out individual `checkWorker` calls after 60 seconds so a single hung cloud API call cannot abort the entire scan.
