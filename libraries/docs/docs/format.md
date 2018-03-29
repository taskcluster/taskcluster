---
title: Documentation Metadata Format
---

A taskcluster-lib-docs output metadata has the following format:

```
.
├── README.md
├── docs
│   └── <whatever you want>.md
├── metadata.json
├── references
│   ├── api.json
│   └── events.json
└── schema
    ├── <some schema>.json
    └── <some other schema>.json
```

All components except `metadata.json` are optional. They are treated as if they
were included in `src/reference/<tier>/<project>` in the
[taskcluster-docs](https://github.com/taskcluster/taskcluster-docs) repo.

The `metadata.json` file should contain the following:

```json
{
  "version": 1,
  "tier": "core",
  "menuIndex": 10,
  "project": "projectName"
}
```

Where `version` is locked to `1`, `tier` must be one of the allowed tiers, and `menuIndex` is an integer that reorders this document in the menu on the docs site (lower is earlier).

In the "old way", the library uploads a tarball containing this data to S3 directly.
In the "new way", the library writes this data structure out to a specified location on the local filesystem.
