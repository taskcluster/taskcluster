package tc

import (
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v18"
	"github.com/taskcluster/taskcluster/clients/client-go/v18/tcawsprovisioner"
)

// An interface containing the functions required of AwsProvisioner, allowing
// use of fakes that also match this interface.
type AwsProvisioner interface {
	GetSecret(token string) (*tcawsprovisioner.SecretResponse, error)
	RemoveSecret(token string) error
}

// A factory type that can create new instances of the AwsProvisioner interface.
type AwsProvisionerClientFactory func(rootURL string, credentials *tcclient.Credentials) (AwsProvisioner, error)
