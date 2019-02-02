package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
)

var (
	// not a const, because in testing we swap this out
	GcpMetadataBaseURL = "http://metadata.google.internal/computeMetadata/v1/"
)

type GcpUserData struct {
	WorkerType         string `json:"workerType"`
	WorkerGroup        string `json:"workerGroup"`
	ProvisionerID      string `json:"provisionerId"`
	CredentialUrl      string `json:"credentialUrl"`
	Audience           string `json:"audience"`
	SigningKeyLocation string `json:"signingKeyLocation"`

	// TODO: Remove these both
	AuthBaseURL  string `json:"authBaseUrl"`
	QueueBaseURL string `json:"queueBaseUrl"`
}

type CredentialRequestData struct {
	Token string `json:"token"`
}

type TaskclusterCreds struct {
	AccessToken string `json:"accessToken"`
	ClientID    string `json:"clientId"`
	Certificate string `json:"certificate"`
}

func queryGcpMetaData(client *http.Client, path string) (string, error) {
	req, err := http.NewRequest("GET", GcpMetadataBaseURL+path, nil)

	if err != nil {
		return "", err
	}

	req.Header.Add("Metadata-Flavor", "Google")

	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	return string(content), err
}

func updateConfigWithGcpSettings(c *gwconfig.Config) error {
	log.Print("Querying GCP Metadata to get default worker type config settings...")
	// these are just default values, will be overwritten if set in worker type config
	c.ShutdownMachineOnInternalError = true
	c.ShutdownMachineOnIdle = true

	client := &http.Client{}
	userDataString, err := queryGcpMetaData(client, "instance/attributes/config")
	if err != nil {
		return err
	}

	var userData GcpUserData
	err = json.Unmarshal([]byte(userDataString), &userData)
	if err != nil {
		return err
	}

	c.ProvisionerID = userData.ProvisionerID
	c.WorkerType = userData.WorkerType
	c.WorkerGroup = userData.WorkerGroup

	// TODO: Don't do this anymore
	c.AuthBaseURL = userData.AuthBaseURL
	c.QueueBaseURL = userData.QueueBaseURL
	c.SigningKeyLocation = userData.SigningKeyLocation

	// Now we get taskcluster credentials via instance identity
	// TODO: Disable getting instance identity after first run
	audience := userData.Audience
	instanceIDPath := fmt.Sprintf("instance/service-accounts/default/identity?audience=%s&format=full", audience)
	instanceIDToken, err := queryGcpMetaData(client, instanceIDPath)
	if err != nil {
		return err
	}

	data := CredentialRequestData{Token: instanceIDToken}
	reqData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	dataBuffer := bytes.NewBuffer(reqData)

	credentialUrl := userData.CredentialUrl
	req, err := http.NewRequest("POST", credentialUrl, dataBuffer)
	if err != nil {
		return err
	}

	req.Header.Add("Content-Type", "application/json")

	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var creds TaskclusterCreds
	err = json.Unmarshal([]byte(content), &creds)
	if err != nil {
		return err
	}

	c.AccessToken = creds.AccessToken
	c.ClientID = creds.ClientID
	c.Certificate = creds.Certificate

	gcpMetadata := map[string]interface{}{}
	for _, path := range []string{
		"instance/image",
		"instance/id",
		"instance/machine-type",
		"instance/network-interfaces/0/access-configs/0/external-ip",
		"instance/zone",
		"instance/hostname",
		"instance/network-interfaces/0/ip",
	} {
		key := path[strings.LastIndex(path, "/")+1:]
		value, err := queryGcpMetaData(client, path)
		if err != nil {
			return err
		}
		gcpMetadata[key] = value
	}
	c.WorkerTypeMetadata["gcp"] = gcpMetadata
	c.WorkerID = gcpMetadata["id"].(string)
	c.PublicIP = net.ParseIP(gcpMetadata["external-ip"].(string))
	c.PrivateIP = net.ParseIP(gcpMetadata["ip"].(string))
	c.InstanceID = gcpMetadata["id"].(string)
	c.InstanceType = gcpMetadata["machine-type"].(string)
	c.AvailabilityZone = gcpMetadata["zone"].(string)

	// TODO: Fetch these from secrets
	c.LiveLogSecret = "foobar"

	return nil
}
