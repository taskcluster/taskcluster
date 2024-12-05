audience: worker-deployers
level: major
---
Generic Worker: adds worker config feature toggles to quickly/easily enable/disable features across entire worker pools. All options are enabled, by default.

Generic Worker: adds `d2gConfig` worker config to fine-tune adjust D2G translations. `enableD2G` and `containerEngine` config settings were moved into this new config. The following is the new structure (with default values shown):

```json
{
    ...
    "d2gConfig": {
        "enableD2G": false,
        "allowChainOfTrust": true,
        "allowDisableSeccomp": true,
        "allowHostSharedMemory": true,
        "allowInteractive": true,
        "allowKVM": true,
        "allowLoopbackAudio": true,
        "allowLoopbackVideo": true,
        "allowPrivileged": true,
        "allowPtrace": true,
        "allowTaskclusterProxy": true,
        "containerEngine": "docker"
    },
    ...
}
```

Users will receive a `malformed-payload` error if a feature is requested in the payload and the worker config is disabled.
