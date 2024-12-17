audience: worker-deployers
level: minor
---
Generic Worker: adds `disableNativePayloads` (default: `false`) worker config option (`linux` only) to require all task payloads to be Docker Worker payloads. If this option is set to `true`, the task log will no longer contain the translated task definition and the warning about using Docker Worker payloads.

Tasks submitted with native payloads will be resolved as `exception/malformed-payload`.

Generic Worker: adds `d2gConfig.logTranslation` (default: `true`) worker config to control whether the D2G-translated task definition is logged to the task logs.
