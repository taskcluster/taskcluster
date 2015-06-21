package main

import (
	"encoding/json"
	"github.com/taskcluster/httpbackoff"
	"io/ioutil"
	"time"
)

// for when running in aws
func queryUserData() (*UserData, error) {
	// TODO: currently assuming UserData is json, need to work out with jhford how this will work with provisioner
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-user-data-retrieval
	// call http://169.254.169.254/latest/user-data with httpbackoff
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
	return string(content), err
}

type UserData struct {
	Raw                    string
	Capacity               int
	WorkerType             string
	ProvisionerId          string
	Region                 string
	InstanceType           string
	TaskclusterAccessToken string
	TaskclusterClientId    string
	LaunchSpecGenerated    time.Time
}

func updateConfigWithAmazonSettings(configFile string, provisioner string) error {
	// error indicates whether file existed or not, so can be ignored.
	// loadConfig already returns default config if file doesn't exist
	config, _ := loadConfig(configFile)

	userData, err := queryUserData()
	if err != nil {
		return err
	}
	instanceName, err := queryInstanceName()
	if err != nil {
		return err
	}
	config.ProvisionerId = provisioner
	config.TaskclusterAccessToken = userData.TaskclusterAccessToken
	config.TaskclusterClientId = userData.TaskclusterClientId
	config.WorkerGroup = userData.Region
	config.WorkerId = instanceName
	config.WorkerType = userData.WorkerType
	return nil
}
