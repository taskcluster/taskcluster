package tc

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster/clients/client-go/v21/tcawsprovisioner"
)

func TestAwsProvisionerSecretsGetNosuch(t *testing.T) {
	aws, _ := FakeAwsProvisionerClientFactory("https://tc.example.com", nil)
	_, err := aws.GetSecret("nosuch")
	assert.Equal(t, fmt.Errorf("no secret with that token"), err, "should have gotten an error")
}

func TestAwsProvisionerSecretsRemoveNosuch(t *testing.T) {
	aws, _ := FakeAwsProvisionerClientFactory("https://tc.example.com", nil)
	err := aws.RemoveSecret("nosuch")
	assert.Equal(t, fmt.Errorf("no secret with that token"), err, "should have gotten an error")
}

func TestAwsProvisionerSecretsGetExists(t *testing.T) {
	aws, _ := FakeAwsProvisionerClientFactory("https://tc.example.com", nil)
	secret := &tcawsprovisioner.SecretResponse{
		Credentials: tcawsprovisioner.Credentials{ClientID: "cli"},
		Data:        []byte(`{"cfg": true}`),
		Scopes:      []string{},
	}
	token := FakeAwsProvisionerCreateSecret(secret)
	gotsecret, err := aws.GetSecret(token)
	assert.NoError(t, err, "should not fail")
	assert.Equal(t, secret, gotsecret, "should have gotten the secret back")

	fakegot := FakeAwsProvisionerGetSecret(token)
	assert.Equal(t, secret, fakegot, "FakeAwsProvisionerGetSecret should return it too")

	err = aws.RemoveSecret(token)
	assert.NoError(t, err, "should not fail")
	fakegot = FakeAwsProvisionerGetSecret(token)
	assert.Nil(t, fakegot, "secret should be gone")
}
