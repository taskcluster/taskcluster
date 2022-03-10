# Worker Manager Service

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-worker-manager test` to run the tests.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-worker-manager)`, then run the tests again.

## Implementing Providers

See [docs/providers.md](docs/providers.md) for details on implementing providers.

## Testing

Azure tests rely on valid `test/fixtures/azure_signature_good` file that can be obtained by running a VM inside Azure cloud to fetch [attested metadata](https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service?tabs=linux#attested-data):

```sh
curl -H Metadata:true --noproxy "*" "http://169.254.169.254/metadata/attested/document?api-version=2021-05-01" | jq -r .signature
```

Note: new signature might be signed by one of the two intermediate certificates (`azure/azure-ca-certs/microsoft_rsa_tls_ca_[12].pem`). This is important for `test/provider_azure_test.js` as it relies on the intermediate cert to do proper tests.

To find out which intermediate cert is used:

```sh
# Decode the signature
base64 -d azure_signature_good > decodedsignature
# Get PKCS7 format
openssl pkcs7 -in decodedsignature -inform DER -out sign.pk7
# Get Public key out of pkc7
openssl pkcs7 -in decodedsignature -inform DER  -print_certs -out signer.pem
# Get the intermediate certificate
curl -s -o intermediate.cer "$(openssl x509 -in signer.pem -text -noout | grep " CA Issuers -" | awk -FURI: '{print $2}')"
openssl x509 -inform der -in intermediate.cer -out intermediate.pem
# Verify the contents
openssl smime -verify -in sign.pk7 -inform pem -noverify

# Verify the subject name for the main certificate
openssl x509 -noout -subject -in signer.pem
# Verify the issuer for the main certificate
openssl x509 -noout -issuer -in signer.pem

#Validate the subject name for intermediate certificate
openssl x509 -noout -subject -in intermediate.pem
#Validate the fingerprint for intermediate certificate
openssl x509 -noout -fingerprint -in intermediate.pem
# Verify the issuer for the intermediate certificate
openssl x509 -noout -issuer -in intermediate.pem
```

Last three lines would contain the values that should match `intermediateCertFingerprint`, `intermediateCertSubject`, `intermediateCertIssuer`, `intermediateCertPath` variables in `test/provider_azure_test.js`.
