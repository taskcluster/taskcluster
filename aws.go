package main

import (
	"encoding/json"
	"fmt"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
	"io/ioutil"
	"time"
)

// for when running in aws
func queryUserData() (*UserData, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-user-data-retrieval
	resp, _, err := httpbackoff.Get("http://169.254.169.254/latest/user-data")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	userData := new(UserData)
	decoder := json.NewDecoder(resp.Body)
	err = decoder.Decode(userData)
	return userData, err
}

func queryInstanceName() (string, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	resp, _, err := httpbackoff.Get("http://169.254.169.254/latest/meta-data/instance-id")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	fmt.Println("Instance name: " + string(content))
	return string(content), err
}

type UserData struct {
	Data                interface{} `json:"data"`
	Capacity            int         `json:"capacity"`
	WorkerType          string      `json:"workerType"`
	ProvisionerId       string      `json:"provisionerId"`
	Region              string      `json:"region"`
	InstanceType        string      `json:"instanceType"`
	LaunchSpecGenerated time.Time   `json:"launchSpecGenerated"`
	WorkerModified      time.Time   `json:"workerModified"`
	ProvisionerBaseUrl  string      `json:"provisionerBaseUrl"`
	SecurityToken       string      `json:"securityToken"`
}

func (c *Config) updateConfigWithAmazonSettings() error {
	userData, err := queryUserData()
	if err != nil {
		return err
	}
	instanceName, err := queryInstanceName()
	if err != nil {
		return err
	}
	c.ProvisionerId = userData.ProvisionerId
	awsprov := awsprovisioner.Auth{
		Authenticate: false,
		BaseURL:      userData.ProvisionerBaseUrl,
	}
	secToken, callSummary := awsprov.GetSecret(userData.SecurityToken)
	if callSummary.Error != nil {
		return callSummary.Error
	}
	c.AccessToken = secToken.Credentials.AccessToken
	c.ClientId = secToken.Credentials.ClientId
	c.Certificate = secToken.Credentials.Certificate
	c.WorkerGroup = userData.Region
	c.WorkerId = instanceName
	c.WorkerType = userData.WorkerType
	// TODO: uncomment this when all is working
	// now delete secret
	// callSummary = awsprov.RemoveSecret(userData.SecurityToken)
	// if callSummary.Error != nil {
	// 	return callSummary.Error
	// }
	fmt.Printf("\n\nConfig\n\n%#v\n\n", c)
	return nil
}
