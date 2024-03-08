package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/gwconfig"
)

type StaticConfigProvider struct {
}

func (s *StaticConfigProvider) UpdateConfig(c *gwconfig.Config) error {
	log.Print("Configuring with static provider...")

	if staticSecret == "" {
		return fmt.Errorf("--static-secret is required when using --configure-for-static")
	}

	providerType := tcworkermanager.StaticProviderType{
		StaticSecret: staticSecret,
	}

	userData := &WorkerManagerUserData{
		WorkerPoolID: c.ProvisionerID + "/" + c.WorkerType,
		ProviderID:   "static",
		WorkerGroup:  c.WorkerGroup,
		RootURL:      c.RootURL,
	}

	// For static workers, the worker location is just "static"
	if c.WorkerLocation == "" {
		workerLocationJSON, err := json.Marshal(map[string]string{
			"cloud": "static",
		})
		if err != nil {
			return fmt.Errorf("error encoding worker location as JSON: %v", err)
		}
		c.WorkerLocation = string(workerLocationJSON)
	}

	return userData.UpdateConfig(c, providerType)
}

func (s *StaticConfigProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}
