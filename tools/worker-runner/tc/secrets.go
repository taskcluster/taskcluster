package tc

import (
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcsecrets"
)

// An interface containing the functions required of Secrets, allowing
// use of fakes that also match this interface.
type Secrets interface {
	Get(name string) (*tcsecrets.Secret, error)
}

// A factory type that can create new instances of the Secrets interface.
type SecretsClientFactory func(rootURL string, credentials *tcclient.Credentials) (Secrets, error)
