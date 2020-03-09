package main

import (
	"github.com/taskcluster/taskcluster/v26/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v26/workers/generic-worker/gwconfig"
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
		Document:  string(awsMetadata["document"]),
		Signature: string(awsMetadata["signature"]),
	}

	return a.UserData.UpdateConfig(c, providerType)
}
