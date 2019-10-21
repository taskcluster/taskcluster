package main

import (
	"encoding/json"
	"fmt"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster-client-go/tcworkermanager"
)

func updateConfigAWSProvider(c *gwconfig.Config, awsMetadata map[string][]byte, userData *WorkerManagerUserData) error {

	providerType := &tcworkermanager.AwsProviderType{
		// Document must be a string, not an object
		Document:  json.RawMessage(fmt.Sprintf(`%q`, string(awsMetadata["document"]))),
		Signature: string(awsMetadata["signature"]),
	}

	return userData.updateConfig(c, providerType)
}
