audience: developers
level: major
---
The jsonschema2go tool now considers `SHA` and `KVM` to be words that should be
capitalised when generating go type names.

As a consequence, the taskcluster go client is backwardly incomaptible with the
previous release, since the `tcgithub.Build` struct member `Sha` has been
renamed to `SHA`.
