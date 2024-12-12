audience: worker-deployers
level: major
---
Generic Worker: adds worker config feature toggles to quickly/easily enable/disable features across entire worker pools. All features are enabled, by default.

Generic Worker: adds `d2gConfig` worker config to configure D2G translations. `enableD2G` and `containerEngine` config settings have been moved into this new config. The following is the new structure (with default values shown):

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

Tasks using disabled features will be resolved as `exception/malformed-payload`.
