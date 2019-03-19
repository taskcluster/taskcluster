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
	GCPMetadataBaseURL = "http://metadata.google.internal/computeMetadata/v1/"
)

type GCPUserData struct {
	WorkerType                string `json:"workerType"`
	WorkerGroup               string `json:"workerGroup"`
	ProvisionerID             string `json:"provisionerId"`
	CredentialURL             string `json:"credentialURL"`
	Audience                  string `json:"audience"`
	Ed25519SigningKeyLocation string `json:"ed25519SigningKeyLocation"`
	RootURL                   string `json:"rootURL"`
}

type CredentialRequestData struct {
	Token string `json:"token"`
}

type TaskclusterCreds struct {
	AccessToken string `json:"accessToken"`
	ClientID    string `json:"clientId"`
	Certificate string `json:"certificate"`
}

func queryGCPMetaData(client *http.Client, path string) (string, error) {
	req, err := http.NewRequest("GET", GCPMetadataBaseURL+path, nil)

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

func updateConfigWithGCPSettings(c *gwconfig.Config) error {
	log.Print("Querying GCP Metadata to get default worker type config settings...")
	// these are just default values, will be overwritten if set in worker type config
	c.ShutdownMachineOnInternalError = true
	c.ShutdownMachineOnIdle = true

	client := &http.Client{}
	userDataString, err := queryGCPMetaData(client, "instance/attributes/config")
	if err != nil {
		return err
	}

	var userData GCPUserData
	err = json.Unmarshal([]byte(userDataString), &userData)
	if err != nil {
		return err
	}

	c.ProvisionerID = userData.ProvisionerID
	c.WorkerType = userData.WorkerType
	c.WorkerGroup = userData.WorkerGroup

	c.RootURL = userData.RootURL
	c.Ed25519SigningKeyLocation = userData.Ed25519SigningKeyLocation

	// Now we get taskcluster credentials via instance identity
	// TODO: Disable getting instance identity after first run
	audience := userData.Audience
	instanceIDPath := fmt.Sprintf("instance/service-accounts/default/identity?audience=%s&format=full", audience)
	instanceIDToken, err := queryGCPMetaData(client, instanceIDPath)
	if err != nil {
		return err
	}

	data := CredentialRequestData{Token: instanceIDToken}
	reqData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	dataBuffer := bytes.NewBuffer(reqData)

	credentialURL := userData.CredentialURL
	req, err := http.NewRequest("POST", credentialURL, dataBuffer)
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
		value, err := queryGCPMetaData(client, path)
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
