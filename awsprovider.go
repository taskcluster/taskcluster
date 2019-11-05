package main

import (
	"encoding/json"
	"fmt"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster-client-go/tcworkermanager"
)

type AWSProvider struct {
	UserData *WorkerManagerUserData
}

func (a *AWSProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}

func (a *AWSProvider) UpdateConfig(c *gwconfig.Config) error {

	awsMetadata, err := AWSUpdateConfig(c)
	if err != nil {
		return err
	}
	providerType := &tcworkermanager.AwsProviderType{
		// Document must be a string, not an object
		Document:  json.RawMessage(fmt.Sprintf(`%q`, string(awsMetadata["document"]))),
		Signature: string(awsMetadata["signature"]),
	}

	return a.UserData.UpdateConfig(c, providerType)
}
