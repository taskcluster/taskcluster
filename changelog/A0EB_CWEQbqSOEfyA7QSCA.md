audience: users
level: major
---
User provided YAMLs (such as `.taskcluster.yml` and hook definitions) are now parsed with js-yaml 5. This changes how some values are interpreted:

- `!!set` and complex keys (list or object) are no longer supported
- `0b` prefixed integers, signed hex/binary integers (`+0x42`, `-0b10`) and numbers containing underscores (`4_2`) are now parsed as strings instead of numbers
- signed floats with their leading 0 omitted (`-.5`/`+.5`) are now floats instead of strings
