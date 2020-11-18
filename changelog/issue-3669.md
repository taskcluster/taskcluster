audience: worker-deployers
level: minor
reference: issue 3669
---
The Azure worker-manager takes additional steps to verify the identity proof
during worker registration. The identify proof is the output of the
[attested data API](https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service#attested-data),
which includes details about the worker and is signed by the Azure platform.

Previously, the worker-manager checked that the message signer was issued by
one of four published intermediate certificates issued by a single root CA.
Azure is planning to expand to five more root CAs (see
[Azure TLS certificate changes](https://docs.microsoft.com/en-us/azure/security/fundamentals/tls-certificate-changes)
for details). The worker-manager now downloads an unknown intermediate
certificate, verifies that it was issued by a known root CAs, and adds it to
the list of trusted certificates. The 4 legacy intermediate certificates, still
in use in Azure as of November 2020, are pre-loaded as trusted certificates.

The worker manager now verifies that the message signer is for
`metadata.azure.com` or a subdomain. This is true for any workers in the
Azure public cloud, but not the sovereign clouds like azure.us.

One of the new root CAs uses Elliptic Curve Cryptography (ECC) instead of RSA.
The Azure worker-manager doesn't support this or other ECC certificates.
This is tracked in [issue #3923](https://github.com/taskcluster/taskcluster/issues/3923).

There is no performance change expected until Azure ships the TLS certificate
changes, planned by February 15, 2021. When new intermediate certificates are
used, there will be up to a 5 second delay on worker registration while the new
certificate is downloaded for the first time. A new manager log entry,
``registration-new-intermediate-certificate``, is emitted after a successful
download and verification, and includes the certificate details.
