package awsprovisioner

import (
	"fmt"
	"strings"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

type AwsProvisionerProvider struct {
	cfg                         *cfg.RunnerConfig
	awsProvisionerClientFactory tc.AwsProvisionerClientFactory
	metadataService             MetadataService
}

func (p *AwsProvisionerProvider) ConfigureRun(run *runner.Run) error {
	// create an unauthenticated aws provisioner client to get the "secret"
	_, err := p.awsProvisionerClientFactory("foo", nil)
	if err != nil {
		return err
	}

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		// if we can't read user data, this is a serious problem
		return fmt.Errorf("Could not query user data: %v", err)
	}
	run.RootURL = userData.TaskclusterRootURL

	// We need an AWS Provisioner client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	awsprov, err := p.awsProvisionerClientFactory(run.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create AWS provisioner client: %v", err)
	}

	secToken, getErr := awsprov.GetSecret(userData.SecurityToken)
	// remove secrets even if we couldn't retrieve them!
	removeErr := awsprov.RemoveSecret(userData.SecurityToken)
	if getErr != nil {
		// serious error
		return fmt.Errorf("Could not fetch credentials from AWS Provisioner: %v", getErr)
	}
	if removeErr != nil {
		// security risk if we can't delete secret, so return err
		return fmt.Errorf("Could not delete credentials for worker in AWS Provisioner: %v", removeErr)
	}

	run.Credentials.ClientID = secToken.Credentials.ClientID
	run.Credentials.AccessToken = secToken.Credentials.AccessToken
	run.Credentials.Certificate = secToken.Credentials.Certificate

	// aws-provisioner still speaks of provisionerID/workerType
	run.WorkerPoolID = fmt.Sprintf("%s/%s", userData.ProvisionerID, userData.WorkerType)

	run.WorkerGroup = userData.Region

	run.WorkerConfig = run.WorkerConfig.Merge(userData.Data.Config)

	awsMetadata := map[string]string{}
	for _, path := range []string{
		"/meta-data/ami-id",
		"/meta-data/instance-id",
		"/meta-data/instance-type",
		"/meta-data/public-ipv4",
		"/meta-data/placement/availability-zone",
		"/meta-data/public-hostname",
		"/meta-data/local-ipv4",
	} {
		key := path[strings.LastIndex(path, "/")+1:]
		value, err := p.metadataService.queryMetadata(path)
		if err != nil {
			// not being able to read metadata is serious error
			return fmt.Errorf("Error querying AWS metadata %v: %v", path, err)
		}
		awsMetadata[key] = value
	}

	run.WorkerID = awsMetadata["instance-id"]
	run.ProviderMetadata = awsMetadata

	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.AwsProvisioner, error) {
	prov := tcawsprovisioner.New(credentials)
	prov.BaseURL = tcclient.BaseURL(rootURL, "aws-provisioner", "v1")
	return prov, nil
}

func New(cfg *cfg.RunnerConfig) (provider.Provider, error) {
	return new(cfg, nil, nil)
}

func Usage() string {
	return `
The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

	provider:
	    providerType: aws-provisioner
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(cfg *cfg.RunnerConfig, awsProvisionerClientFactory tc.AwsProvisionerClientFactory, metadataService MetadataService) (*AwsProvisionerProvider, error) {
	if awsProvisionerClientFactory == nil {
		awsProvisionerClientFactory = clientFactory
	}
	if metadataService == nil {
		metadataService = &realMetadataService{}
	}
	return &AwsProvisionerProvider{cfg, awsProvisionerClientFactory, metadataService}, nil
}
