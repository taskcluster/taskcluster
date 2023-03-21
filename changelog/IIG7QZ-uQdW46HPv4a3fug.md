audience: general
level: minor
---
jsonschema2go: jsonschema default values are encoded into struct tags of generated go types for use with github.com/mcuadros/go-defaults.

In order to utilise this new features, callers should call `defaults.SetDefaults(&val)` before calling `json.Unmarshal(data, &val)`.
