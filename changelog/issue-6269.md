audience: developers
level: minor
reference: issue 6269
---
Generic Worker now provides configuration property `maxTaskRunTime` as an upper bound for task payload property `maxRunTime`. Tasks with `maxRunTime` exceeding this value will be resolved as `exception/malformed-payload`.
