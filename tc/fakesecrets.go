package tc

import (
	"fmt"

	"github.com/taskcluster/httpbackoff"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcsecrets"
)

var (
	secrets map[string]*tcsecrets.Secret
)

type FakeSecrets struct {
	authenticated bool
}

func (cli *FakeSecrets) Get(name string) (*tcsecrets.Secret, error) {
	if !cli.authenticated {
		return nil, fmt.Errorf("must use an authenticated client to get secret")
	}

	secret, ok := secrets[name]
	if !ok {
		// we need to return a 404 error here.
		cs := tcclient.CallSummary{}
		rc := httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 404,
			Message:          "no secret with that name",
		}
		return nil, &tcclient.APICallException{&cs, rc}
	}

	return secret, nil
}

// Create a new secret with the given content
func FakeSecretsCreateSecret(name string, response *tcsecrets.Secret) {
	if secrets == nil {
		secrets = make(map[string]*tcsecrets.Secret)
	}
	secrets[name] = response
}

// Reset fake secrets
func FakeSecretsReset() {
	secrets = nil
}

// A function matching SecretsClientFactory that can be used in testing
func FakeSecretsClientFactory(rootURL string, credentials *tcclient.Credentials) (Secrets, error) {
	return &FakeSecrets{authenticated: credentials != nil}, nil
}
