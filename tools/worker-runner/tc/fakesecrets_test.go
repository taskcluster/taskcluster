package tc

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcsecrets"
)

func TestSecretsSecretsGetNosuch(t *testing.T) {
	secrets, _ := FakeSecretsClientFactory("https://tc.example.com", &tcclient.Credentials{})
	_, err := secrets.Get("nosuch")
	apiCallException, isAPICallException := err.(*tcclient.APICallException)
	assert.True(t, isAPICallException, "expected APICalLException")
	rootCause := apiCallException.RootCause
	badHTTPResponseCode, isBadHTTPResponseCode := rootCause.(httpbackoff.BadHttpResponseCode)
	assert.True(t, isBadHTTPResponseCode, "expected BadHTTPREsponseCode")
	assert.Equal(t, badHTTPResponseCode.HttpResponseCode, 404, "expected 404")
}

func TestSecretsSecretsGetExists(t *testing.T) {
	secrets, _ := FakeSecretsClientFactory("https://tc.example.com", &tcclient.Credentials{})
	secret := &tcsecrets.Secret{
		Secret: []byte(`{"hello": true}`),
	}
	FakeSecretsCreateSecret("sekrit", secret)
	gotsecret, err := secrets.Get("sekrit")
	assert.Equal(t, nil, err, "should not fail")
	assert.Equal(t, secret, gotsecret, "should have gotten the secret back")
}
