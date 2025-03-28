audience: users
level: minor
reference: issue 7594
---
Docker Worker (D2G): adds `volume` type for artifacts. This is strictly used for D2G purposes only. Use this type to have D2G volume mount your artifact path instead of `docker cp`'ing the artifact at the end of the task run. This can be useful under spot termination instances where the `docker cp` command doesn't get a chance to run, instead a volume mount will have the files on the host ready for upload as soon as the spot termination requests comes in.
