audience: general
level: minor
reference: issue 5456
---
This change adds more DB functions to allow for filtering in the DB based on worker state and quarantined status for the workers page. Previously, filtering would only happen on the initial page loaded from the DB if results were paginated. This should also speed up the workers page rendering when a filter is applied.
