audience: deployers
level: minor
reference: issue 9527
---
Azure providers can now weight Spot launch configurations by their [Azure Spot Placement Score](https://learn.microsoft.com/en-us/rest/api/recommenderrp/spot-placement-scores/post?view=rest-recommenderrp-2025-06-05). Set `spotPlacementScore: true` in the provider configuration and grant `Microsoft.Compute/locations/placementScores/generate/action` to the worker-manager service principal. Launch configurations in regions and VM sizes with less Spot capacity are selected less often, and restricted ones are skipped. This is off by default.
