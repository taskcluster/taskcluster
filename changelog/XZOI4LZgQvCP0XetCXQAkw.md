audience: deployers
level: major
---
Remove support for NewRelic. Deployers must remove newRelic from their Helm values and drop any NEW_RELIC environment variable or secret from non-Helm deployment.
