---
filename: design/logs/README.md
title: Structured Logs
order: 10
---

Logging format is a superset of the mozlog format:

```json
{
  "Timestamp": <time since unix epoch in nanoseconds>,
  "Type": "...",
  "Logger": "...",
  "message": "...",
  "serviceContext": {"service": "..."},
  "Hostname": "...",
  "EnvVersion": "2.0",
  "Severity": ...,
  "severity": ...,
  "Pid": ...,
  "Fields": {...}
}
```

The content of `Fields` can be any arbitary data but certain `Type`s are defined
in the docs site where we ensure that for any messages with that type, the content
of `Fields` will contain certain keys.
