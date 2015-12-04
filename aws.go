package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
)

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

func queryMetaData(url, name string) (string, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	resp, _, err := httpbackoff.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	fmt.Println(name + ": " + string(content))
	return string(content), err
}

func queryInstanceName() (string, error) {
	return queryMetaData("http://169.254.169.254/latest/meta-data/instance-id", "Instance name")
}

func queryPublicIP() (string, error) {
	return queryMetaData("http://169.254.169.254/latest/meta-data/public-ipv4", "Public IP")
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
	publicIP, err := queryPublicIP()
	if err != nil {
		return err
	}
	c.ProvisionerId = userData.ProvisionerId
	awsprov := awsprovisioner.AwsProvisioner{
		Authenticate: false,
		BaseURL:      userData.ProvisionerBaseUrl,
	}
	secToken, _, err := awsprov.GetSecret(userData.SecurityToken)
	if err != nil {
		return err
	}
	c.AccessToken = secToken.Credentials.AccessToken
	c.ClientId = secToken.Credentials.ClientId
	c.Certificate = secToken.Credentials.Certificate
	c.WorkerGroup = userData.Region
	c.WorkerId = instanceName
	c.PublicIP = net.ParseIP(publicIP)
	c.WorkerType = userData.WorkerType
	_, err = awsprov.RemoveSecret(userData.SecurityToken)
	if err != nil {
		return err
	}
	fmt.Printf("\n\nConfig\n\n%#v\n\n", c)
	return nil
}
