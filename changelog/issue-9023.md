audience: developers
level: patch
reference: issue 9023
---
UI Hooks page switches to use direct REST API calls

The View Hook page showed a Next Scheduled Date which is now removed from UI.

This was done as GraphQL invoked an outdated REST endpoint getHookStatus for which we do not have any alternate endpoint or way to get this information.
