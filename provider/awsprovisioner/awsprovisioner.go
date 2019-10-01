package awsprovisioner

import (
	"errors"
	"fmt"
	"log"
	"reflect"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v17"
	"github.com/taskcluster/taskcluster/clients/client-go/v17/tcawsprovisioner"
)

const TERMINATION_PATH = "/meta-data/spot/termination-time"

type AwsProvisionerProvider struct {
	runnercfg                   *cfg.RunnerConfig
	awsProvisionerClientFactory tc.AwsProvisionerClientFactory
	metadataService             MetadataService
	proto                       *protocol.Protocol
	terminationTicker           *time.Ticker
}

func (p *AwsProvisionerProvider) ConfigureRun(state *run.State) error {
	userData, err := p.metadataService.queryUserData()
	if err != nil {
		// if we can't read user data, this is a serious problem
		return fmt.Errorf("Could not query user data: %v", err)
	}
	state.RootURL = userData.TaskclusterRootURL

	// We need an AWS Provisioner client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	awsprov, err := p.awsProvisionerClientFactory(state.RootURL, nil)
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

	state.Credentials.ClientID = secToken.Credentials.ClientID
	state.Credentials.AccessToken = secToken.Credentials.AccessToken
	state.Credentials.Certificate = secToken.Credentials.Certificate

	// aws-provisioner always provides 96-hour credentials
	state.CredentialsExpire = time.Now().Add(96 * time.Hour)

	// aws-provisioner still speaks of provisionerID/workerType
	state.WorkerPoolID = fmt.Sprintf("%s/%s", userData.ProvisionerID, userData.WorkerType)

	state.WorkerGroup = userData.Region

	state.WorkerConfig = state.WorkerConfig.Merge(userData.Data)

	// genericWorker.config will overwrite existing values
	// config from userData.Data.genericWorker.config
	if p.runnercfg.WorkerImplementation.Implementation == "generic-worker" {
		maybeConfig, err := userData.Data.Get("genericWorker.config")
		// userData JSON has a genericWorker.config key
		if err == nil {
			// verify that genericWorker.config is a JSON object
			configMap, ok := maybeConfig.(map[string]interface{})
			if !ok {
				return fmt.Errorf("UserData key `genericWorker.config` must be map[string]interface{}, got %v",
					reflect.TypeOf(maybeConfig))
			}
			genericWorkerConfig := cfg.NewWorkerConfig()
			for k, v := range configMap {
				genericWorkerConfig, err = genericWorkerConfig.Set(k, v)
				if err != nil {
					return fmt.Errorf("Could not set %q to %v in `genericWorkerConfig` %#v", k, v, genericWorkerConfig)
				}
			}
			state.WorkerConfig = state.WorkerConfig.Merge(genericWorkerConfig)
		}
	}

	// aws-provisioner includes capacity in the userdata, but we would like to reflect
	// that as worker config instead.  For compatibility, we just do this when it is
	// not 1
	if userData.Capacity != 1 {
		state.WorkerConfig, err = state.WorkerConfig.Set("capacity", userData.Capacity)
		if err != nil {
			return fmt.Errorf("Could not set workerConfig capacity: %v", err)
		}
	}

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

	// region is available as availability-zone minus the final letter
	az := awsMetadata["availability-zone"]
	awsMetadata["region"] = az[:len(az)-1]

	state.WorkerID = awsMetadata["instance-id"]
	state.ProviderMetadata = awsMetadata
	state.WorkerLocation = map[string]string{
		"cloud":            "aws",
		"region":           awsMetadata["region"],
		"availabilityZone": awsMetadata["availability-zone"],
	}

	// As a special case, set the shutdown behavior configuration specifically
	// for docker-worker on AWS.  In future this should be set in the worker
	// pool config.
	if p.runnercfg.WorkerImplementation.Implementation == "docker-worker" {
		state.WorkerConfig, err = state.WorkerConfig.Set("shutdown.enabled", true)
		if err != nil {
			return fmt.Errorf("Could not set shutdown.enabled: %v", err)
		}
		state.WorkerConfig, err = state.WorkerConfig.Set("shutdown.afterIdleSeconds", 15*60)
		if err != nil {
			return fmt.Errorf("Could not set shutdown.afterIdleSeconds: %v", err)
		}
	}

	return nil
}

func (p *AwsProvisionerProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *AwsProvisionerProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *AwsProvisionerProvider) checkTerminationTime() {
	_, err := p.metadataService.queryMetadata(TERMINATION_PATH)
	// if the file exists (so, no error), it's time to go away
	if err == nil {
		log.Println("EC2 Metadata Service says termination is imminent")
		if p.proto != nil && p.proto.Capable("graceful-termination") {
			p.proto.Send(protocol.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// spot termination generally doesn't leave time to finish tasks
					"finish-tasks": false,
				},
			})
		}
	}
}

func (p *AwsProvisionerProvider) WorkerStarted() error {
	// start polling for graceful shutdown
	p.terminationTicker = time.NewTicker(30 * time.Second)
	go func() {
		for {
			<-p.terminationTicker.C
			log.Println("polling for termination-time")
			p.checkTerminationTime()
		}
	}()

	return nil
}

func (p *AwsProvisionerProvider) WorkerFinished() error {
	p.terminationTicker.Stop()
	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.AwsProvisioner, error) {
	prov := tcawsprovisioner.New(credentials)
	prov.BaseURL = tcclient.BaseURL(rootURL, "aws-provisioner", "v1")
	return prov, nil
}

func New(runnercfg *cfg.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil, nil)
}

func Usage() string {
	return `
The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

` + "```yaml" + `
provider:
    providerType: aws-provisioner
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
defined by this provider has the following fields:

* cloud: aws
* region
* availabilityZone
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *cfg.RunnerConfig, awsProvisionerClientFactory tc.AwsProvisionerClientFactory, metadataService MetadataService) (*AwsProvisionerProvider, error) {
	if awsProvisionerClientFactory == nil {
		awsProvisionerClientFactory = clientFactory
	}
	if metadataService == nil {
		metadataService = &realMetadataService{}
	}

	if _, err := metadataService.queryMetadata(TERMINATION_PATH); err == nil {
		return nil, errors.New("Instance is about to shutdown")
	}

	return &AwsProvisionerProvider{
		runnercfg:                   runnercfg,
		awsProvisionerClientFactory: awsProvisionerClientFactory,
		metadataService:             metadataService,
		proto:                       nil,
		terminationTicker:           nil,
	}, nil
}
