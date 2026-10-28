# Azure Trusted Certificates

Updates and recent information about certificates can be found at [Azure CA details](https://learn.microsoft.com/en-us/azure/security/fundamentals/azure-ca-details)

## Certificate Management Background

The Azure Metadata Service (IMDS) uses certificates to sign the attested data required for Azure VM authentication. To validate this signature, we need to verify the certificate chain presented during the attestation process.

### Microsoft IT TLS CAs (Historical)

The older Microsoft IT TLS CA certificates (`microsoft_it_tls_ca_1.pem` and `microsoft_it_tls_ca_2.pem`) have been phased out and were expired in October 2024. These are no longer included in our certificate bundle.

### Current Azure TLS Certificate Structure

Azure uses several PKI hierarchies for IMDS attested-data signing certificates. New regions / renewals are migrating from the 2017 root to the `Microsoft TLS RSA Root G2` hierarchy as part of the [Azure IMDS attested-data TLS 2025 changes](https://techcommunity.microsoft.com/blog/azuregovernanceandmanagementblog/azure-instance-metadata-service-attested-data-tls-2025-critical-changes/2888953); the rotation runs region by region as each region's leaf cert renews. Both hierarchies must be trusted simultaneously during the rollout.

1. **Microsoft-Issued Chain (legacy):**
   * **Root CA**: Microsoft RSA Root Certificate Authority 2017
   * **Intermediate CAs**: Microsoft Azure RSA TLS Issuing CAs (directly signed by Microsoft's root)

2. **Microsoft TLS RSA Root G2 Chain (new, post-2025):**
   * **Root CA**: Microsoft TLS RSA Root G2
   * **Intermediate CAs**: `Microsoft TLS G2 RSA CA OCSP NN` (`02` and `04` are bundled; others are fetched dynamically via the AIA path, see "Dynamic Downloading" below)

### Cross-signed intermediates (removed)

The Microsoft Azure RSA TLS Issuing CAs were also published as DigiCert-cross-signed copies (with "-xsign" in their filenames) that chained up to DigiCert Global Root G2. Those copies expired on 2026-08-25 and are no longer bundled. Leaf certificates whose AIA still points at an "-xsign" URL validate against the Microsoft-signed copy of the same intermediate, which has the same subject and key.

## Root Certificates

Node.js includes most of the necessary root CAs in its built-in trust store [tls.rootCertificates](https://nodejs.org/api/tls.html#tls_tls_rootcertificates). Microsoft's own RSA roots are not in that bundle, so we include them here:

* `microsoft_rsa_root_certificate_authority_2017.pem` - Microsoft's RSA root that expires in 2042
* `microsoft_tls_rsa_root_g2.pem` - Microsoft TLS RSA Root G2, used by the post-2025 Azure IMDS attested-data hierarchy and expires in 2040

## Downloading certificates

`node download-certs.js` downloads all certificates defined in `certificates.json` file and converts CRT files to PEM format.

The certificates in our bundle are those listed in the [Azure CA details](https://learn.microsoft.com/en-us/azure/security/fundamentals/azure-ca-details) page, specifically focusing on the intermediate RSA TLS issuing CAs used by Azure services.

## Important Notes

1. **Certificate Format**: All downloaded certificates are converted to PEM format (required by our validation code).
2. **Expiration Dates**: The current intermediate certificates expiration dates are listed in the table below.
3. **Certificate Updates**: Microsoft periodically updates their certificate infrastructure. Monitor the [Azure CA details](https://learn.microsoft.com/en-us/azure/security/fundamentals/azure-ca-details) page for changes.
4. **Dynamic Downloading**: Our code includes a fallback mechanism to dynamically download intermediate certificates if needed, but bundling known intermediates is more reliable.

## List of downloaded certificates

<!-- CERTIFICATES -->
| Certificate Filename | Expiration Date |
|----------------------|-----------------|
| [microsoft_rsa_root_certificate_authority_2017.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20RSA%20Root%20Certificate%20Authority%202017.crt) | Jul 18 23:00:23 2042 GMT |
| [microsoft_tls_rsa_root_g2.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20TLS%20RSA%20Root%20G2.crt) | Apr 10 18:43:51 2040 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_03.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2003.crt) | May 25 23:49:25 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_04.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2004.crt) | May 25 23:49:33 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_07.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2007.crt) | May 25 23:49:30 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_08.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2008.crt) | May 25 23:49:28 2028 GMT |
| [microsoft_tls_g2_rsa_ca_ocsp_02.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20TLS%20G2%20RSA%20CA%20OCSP%2002.crt) | Jun  3 20:03:00 2029 GMT |
| [microsoft_tls_g2_rsa_ca_ocsp_04.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20TLS%20G2%20RSA%20CA%20OCSP%2004.crt) | Jun  3 20:02:59 2029 GMT |
