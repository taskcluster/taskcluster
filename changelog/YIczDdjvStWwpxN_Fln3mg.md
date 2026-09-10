audience: developers
level: silent
---
Convert `@taskcluster/lib-iterate` from JavaScript to TypeScript, run natively on Node 24 type stripping.

Run `yarn types` (`tsc --noEmit`) in CI with TypeScript 7. Node type stripping does not type-check, so this is the check that reports type errors.
