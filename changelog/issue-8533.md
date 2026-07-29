audience: developers
level: patch
reference: issue 8533
---
Refreshed the Azure IMDS attested-data test fixture (`services/worker-manager/test/fixtures/azure_signature_good.json`), whose leaf certificate expired on 2026-07-28.
The new document is signed under the post-2025 `Microsoft TLS RSA Root G2` hierarchy, so the `Microsoft TLS G2 RSA CA OCSP 02` and `04` intermediates are now bundled in the worker-manager Azure CA store.
