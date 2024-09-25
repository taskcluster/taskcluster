audience: worker-deployers
level: major
reference: issue 7235
---
Generic Worker (windows): Removes calls to `wmic` (being [deprecated](https://techcommunity.microsoft.com/t5/windows-it-pro-blog/wmi-command-line-wmic-utility-deprecation-next-steps/ba-p/4039242)) and `net` in favor of a more modern approach using PowerShell cmdlets.

The `powershell` executable is required to be in the path.
