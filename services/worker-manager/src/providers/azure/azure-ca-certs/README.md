# Azure Trusted Certificates

## Microsoft IT TLS CAs

These CA certificates were obtained from
[Microsoft's PKI repository](https://www.microsoft.com/pki/mscorp/cps/default.htm),
and converted from DER to PEM format.  The idea behind bundling them here is so
that we can more easily verify the chain of trust of the certificate used to sign the
[attested data message](https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service#attested-data).

The certificates expire in October 2024.  When that occurs, the service should continue
to operate, by downloading any replacement certificates, but as with anything Azure-related,
this is not guaranteed.

The certs are:

* ``microsoft_it_tls_ca_1.pem``
* ``microsoft_it_tls_ca_2.pem``

## Microsoft Root Certificates

Azure has announced
[Azure TLS certificate changes](https://docs.microsoft.com/en-us/azure/security/fundamentals/tls-certificate-changes)
that will impact attested message signing. Azure will use 5 new root CAs and
the current Microsoft IT TLS CA will be revoked around February 15, 2021. We
are not sure if or when the metadata API certificates will change.

Node.js includes a set of root CAs in
[tls.rootCertificates](https://nodejs.org/api/tls.html#tls_tls_rootcertificates).

## Downloading certificates

`node download-certs.js` downloads all certificates defined in `certificates.json` file
and converts CRT files to PEM

## List of downloaded certificates

<!-- CERTIFICATES -->
| Certificate Filename | Expiration Date |
|----------------------|-----------------|
| [microsoft_rsa_tls_ca_1.pem](http://www.microsoft.com/pki/mscorp/Microsoft%20RSA%20TLS%20CA%2001.crt) | Oct  8 07:00:00 2024 GMT |
| [microsoft_rsa_tls_ca_2.pem](http://www.microsoft.com/pki/mscorp/Microsoft%20RSA%20TLS%20CA%2002.crt) | Oct  8 07:00:00 2024 GMT |
| [microsoft_rsa_root_certificate_authority_2017.pem](https://www.microsoft.com/pkiops/certs/Microsoft%20RSA%20Root%20Certificate%20Authority%202017.crt) | Jul 18 23:00:23 2042 GMT |
| [microsoft_ecc_root_certificate_authority_2017.pem](http://www.microsoft.com/pki/mscorp/Microsoft%20RSA%20TLS%20CA%2001.crt) | Oct  8 07:00:00 2024 GMT |
