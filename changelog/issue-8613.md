audience: users
level: patch
reference: issue 8613
---
Migrates the `taskcluster` shell client's Homebrew release pipeline from the deprecated GoReleaser `brews` field to `homebrew_casks`. `brew install taskcluster/tap/taskcluster` still works, and existing formula installs auto-migrate on the next `brew update`.
