package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v37/workers/generic-worker/gwconfig"
)

type WorkerManagerUserData struct {
	WorkerPoolID string          `json:"workerPoolId"`
	ProviderID   string          `json:"providerId"`
	WorkerGroup  string          `json:"workerGroup"`
	RootURL      string          `json:"rootUrl"`
	WorkerConfig BootstrapConfig `json:"workerConfig"`
}

type Provider uint

const (
	NO_PROVIDER = iota
	AWS_PROVIDER
	AZURE_PROVIDER
	GCP_PROVIDER
)

func (userData *WorkerManagerUserData) UpdateConfig(c *gwconfig.Config, providerType interface{}) error {
	wp := strings.SplitN(userData.WorkerPoolID, "/", -1)
	if len(wp) != 2 {
		return fmt.Errorf("Was expecting WorkerPoolID to have syntax <provisionerId>/<workerType> but was %q", userData.WorkerPoolID)
	}

	c.ProvisionerID = wp[0]
	c.WorkerType = wp[1]
	c.WorkerGroup = userData.WorkerGroup
	c.RootURL = userData.RootURL

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm := serviceFactory.WorkerManager(nil, config.RootURL)

	workerIdentityProof, err := json.Marshal(providerType)
	if err != nil {
		return fmt.Errorf("Could not marshal provider type %#v: %v", providerType, err)
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        userData.WorkerPoolID,
		ProviderID:          userData.ProviderID,
		WorkerGroup:         userData.WorkerGroup,
		WorkerID:            c.WorkerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})

	if err != nil {
		return fmt.Errorf("Could not register worker: %v", err)
	}

	c.AccessToken = reg.Credentials.AccessToken
	c.Certificate = reg.Credentials.Certificate
	c.ClientID = reg.Credentials.ClientID

	// TODO: process reg.Expires

	return Bootstrap(c, &userData.WorkerConfig, "worker-pool")
}

func WMDeploymentID() (string, error) {
	log.Print("Checking if there is a new deploymentId...")
	wm := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
	wpfd, err := wm.WorkerPool(config.ProvisionerID + "/" + config.WorkerType)
	if err != nil {
		return "", fmt.Errorf("**** Can't reach worker-manager to see if there is a new deploymentId: %v", err)
	}
	workerManagerConfig := new(WorkerManagerConfig)
	err = json.Unmarshal(wpfd.Config, &workerManagerConfig)
	if err != nil {
		return "", errors.New("WARNING: Can't decode /userData portion of worker type definition - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool!")
	}

	if len(workerManagerConfig.LaunchConfigs) < 1 {
		return "", errors.New("WARNING: No launchConfigs in worker pool configuration - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool!")
	}

	publicHostSetup, err := workerManagerConfig.LaunchConfigs[0].WorkerConfig.PublicHostSetup()
	if err != nil {
		return "", fmt.Errorf("WARNING: Can't extract public host setup from latest userdata for worker type %v - not shutting down as latest user data is probably botched: %v", config.WorkerType, err)
	}
	return publicHostSetup.Config.DeploymentID, nil
}

type WorkerManagerLaunchConfig struct {
	WorkerConfig BootstrapConfig `json:"workerConfig"`
}

type WorkerManagerConfig struct {
	LaunchConfigs []WorkerManagerLaunchConfig `json:"launchConfigs"`
}
