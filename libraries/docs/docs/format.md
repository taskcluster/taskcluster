---
title: Documentation Tarball Format
description: The specification of how the docs upload must be structured.
---

# Taskcluster Docs Tarball Format

A taskcluster-lib-docs tarball has the following contents:

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

The `metadata.json` file should contain the following:

```json
{
  "version": 1,
  "tier": "core",
  "menuIndex": 10
}
```

Where `version` is locked to `1`, `tier` is either `platform` or `core`, and `menuIndex` is an integer that reorders this document in the menu on the docs site (lower is earlier).
