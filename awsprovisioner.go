package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
)

var (
	// for querying deploymentId
	provisioner *tcawsprovisioner.AwsProvisioner
)

// taken from https://github.com/taskcluster/aws-provisioner/blob/5a2bc7c57b20df00f9c4357e0daeb7967e6f5ee8/lib/worker-type.js#L607-L624
type AWSProvisionerUserData struct {
	Data                BootstrapConfig `json:"data"`
	Capacity            int             `json:"capacity"`
	WorkerType          string          `json:"workerType"`
	ProvisionerID       string          `json:"provisionerId"`
	Region              string          `json:"region"`
	AvailabilityZone    string          `json:"availabilityZone"`
	InstanceType        string          `json:"instanceType"`
	SpotBid             float64         `json:"spotBid"`
	Price               float64         `json:"price"`
	LaunchSpecGenerated time.Time       `json:"launchSpecGenerated"`
	LastModified        time.Time       `json:"lastModified"`
	ProvisionerBaseURL  string          `json:"provisionerBaseUrl"`
	TaskclusterRootURL  string          `json:"taskclusterRootUrl"`
	SecurityToken       string          `json:"securityToken"`
}

func updateConfigAWSProvisioner(c *gwconfig.Config, awsMetadata map[string][]byte, userData *AWSProvisionerUserData) error {
	c.ProvisionerID = userData.ProvisionerID
	c.ProvisionerBaseURL = userData.ProvisionerBaseURL
	c.RootURL = userData.TaskclusterRootURL

	// We need an AWS Provisioner client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	awsprov := c.AWSProvisioner()
	awsprov.Authenticate = false
	awsprov.Credentials = nil

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

	c.AccessToken = secToken.Credentials.AccessToken
	c.Certificate = secToken.Credentials.Certificate
	c.ClientID = secToken.Credentials.ClientID
	c.WorkerGroup = userData.Region
	c.WorkerType = userData.WorkerType

	newestDeploymentID = func() (string, error) {
		log.Print("Checking if there is a new deploymentId...")
		wtr, err := provisioner.WorkerType(config.WorkerType)
		if err != nil {
			return "", fmt.Errorf("**** Can't reach provisioner to see if there is a new deploymentId: %v", err)
		}
		workerTypeDefinitionUserData := new(BootstrapConfig)
		err = json.Unmarshal(wtr.UserData, &workerTypeDefinitionUserData)
		if err != nil {
			return "", errors.New("WARNING: Can't decode /userData portion of worker type definition - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool!")
		}
		publicHostSetup, err := workerTypeDefinitionUserData.PublicHostSetup()
		if err != nil {
			return "", fmt.Errorf("WARNING: Can't extract public host setup from latest userdata for worker type %v - not shutting down as latest user data is probably botched: %v", config.WorkerType, err)
		}
		return publicHostSetup.Config.DeploymentID, nil
	}

	return Bootstrap(c, &userData.Data, "worker-type")
}
