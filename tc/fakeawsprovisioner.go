package tc

import (
	"fmt"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v18"
	"github.com/taskcluster/taskcluster/clients/client-go/v18/tcawsprovisioner"
)

var (
	awsProvisionerSecrets map[string]*tcawsprovisioner.SecretResponse
)

type FakeAwsProvisioner struct {
	authenticated bool
}

func (cli *FakeAwsProvisioner) GetSecret(token string) (*tcawsprovisioner.SecretResponse, error) {
	if cli.authenticated {
		return nil, fmt.Errorf("must use an unauthenticated client to get secret")
	}

	secret, ok := awsProvisionerSecrets[token]
	if !ok {
		return nil, fmt.Errorf("no secret with that token")
	}

	return secret, nil
}

func (cli *FakeAwsProvisioner) RemoveSecret(token string) error {
	if cli.authenticated {
		return fmt.Errorf("must use an unauthenticated client to remove secret")
	}

	_, ok := awsProvisionerSecrets[token]
	if !ok {
		return fmt.Errorf("no secret with that token")
	}

	delete(awsProvisionerSecrets, token)
	return nil
}

// Create a new secret with the given content, returning the token
func FakeAwsProvisionerCreateSecret(response *tcawsprovisioner.SecretResponse) string {
	token := slugid.Nice()
	if awsProvisionerSecrets == nil {
		awsProvisionerSecrets = make(map[string]*tcawsprovisioner.SecretResponse)
	}
	awsProvisionerSecrets[token] = response
	return token
}

// Get a secret with the given token; used to check that secrets are removed.
func FakeAwsProvisionerGetSecret(token string) *tcawsprovisioner.SecretResponse {
	return awsProvisionerSecrets[token]
}

// A function matching AwsProvisionerClientFactory that can be used in testing
func FakeAwsProvisionerClientFactory(rootURL string, credentials *tcclient.Credentials) (AwsProvisioner, error) {
	return &FakeAwsProvisioner{authenticated: credentials != nil}, nil
}
