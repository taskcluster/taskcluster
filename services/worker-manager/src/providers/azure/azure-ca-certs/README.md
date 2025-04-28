# Azure Trusted Certificates

Updates and recent information about certificates can be found at [Azure CA details](https://learn.microsoft.com/en-us/azure/security/fundamentals/azure-ca-details)

## Certificate Management Background

The Azure Metadata Service (IMDS) uses certificates to sign the attested data required for Azure VM authentication. To validate this signature, we need to verify the certificate chain presented during the attestation process.

### Microsoft IT TLS CAs (Historical)

The older Microsoft IT TLS CA certificates (`microsoft_it_tls_ca_1.pem` and `microsoft_it_tls_ca_2.pem`) have been phased out and were expired in October 2024. These are no longer included in our certificate bundle.

### Current Azure TLS Certificate Structure

Azure now uses a more complex PKI structure with multiple certificate paths:

1. **DigiCert-Issued Chain:**
   * **Root CA**: DigiCert Global Root G2 (widely trusted in most operating systems)
   * **Intermediate CAs**: Microsoft Azure RSA TLS Issuing CAs (cross-signed by DigiCert, with "-xsign" in their filenames)

2. **Microsoft-Issued Chain:**
   * **Root CA**: Microsoft RSA Root Certificate Authority 2017 (newer Microsoft root)
   * **Intermediate CAs**: Microsoft Azure RSA TLS Issuing CAs (directly signed by Microsoft's root)

Both chains are valid and serve the same purpose. The cross-signed intermediate certificates (with "-xsign" suffix) create a trust path to the widely trusted DigiCert roots, while the Microsoft-signed intermediates create a direct path to Microsoft's own root.

## Cross-Signing Explained

Microsoft uses cross-signing to ensure maximum compatibility across different clients and trust stores:

* **Cross-signed certificates** (with "-xsign" suffix) chain up to DigiCert roots that are widely trusted.
* **Direct-signed certificates** (without the suffix) chain up to Microsoft's newer roots.

Our certificate bundle includes both versions to ensure we can validate certificates regardless of which chain Azure presents.

## Root Certificates

Node.js includes most of the necessary root CAs in its built-in trust store [tls.rootCertificates](https://nodejs.org/api/tls.html#tls_tls_rootcertificates). For completeness, we include:

* `microsoft_rsa_root_certificate_authority_2017.pem` - Microsoft's own RSA root that expires in 2042

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
| [microsoft_azure_rsa_tls_issuing_ca_03_xsign.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2003%20-%20xsign.crt) | Aug 25 23:59:59 2026 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_03.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2003.crt) | May 25 23:49:25 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_04_xsign.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2004%20-%20xsign.crt) | Aug 25 23:59:59 2026 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_04.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2004.crt) | May 25 23:49:33 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_07_xsign.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2007%20-%20xsign.crt) | Aug 25 23:59:59 2026 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_07.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2007.crt) | May 25 23:49:30 2028 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_08_xsign.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2008%20-%20xsign.crt) | Aug 25 23:59:59 2026 GMT |
| [microsoft_azure_rsa_tls_issuing_ca_08.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2008.crt) | May 25 23:49:28 2028 GMT |
