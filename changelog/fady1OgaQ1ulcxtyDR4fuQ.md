audience: worker-deployers
level: major
---
D2G: Renamed methods `Convert()` --> `ConvertPayload()` and `Scopes()` --> `ConvertScopes()`.

D2G: `ConvertScopes()` checks that the provided docker worker payload is valid with the supplied scopes. Generic Worker will now resolve a docker worker task as `exception/malformed-payload` if any required docker worker scopes are missing for its payload.
