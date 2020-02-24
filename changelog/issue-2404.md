level: patch
reference: issue 2404
---
Fix worker type page when the latest task has no runs. Previously, an error
panel was being displayed with text "t.run is null".
