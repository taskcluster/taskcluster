package gwconfig

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"os"
	"reflect"
	"sync"

	tcclient "github.com/taskcluster/taskcluster/v31/clients/client-go"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/fileutil"
)

type (
	// Generic Worker config
	Config struct {
		PrivateConfig
		PublicConfig

		// a lock for access to ClientID, AccessToken, and
		// Certificate, since these values must change as a group
		credsMutex sync.Mutex
	}

	PublicConfig struct {
		PublicEngineConfig
		AvailabilityZone               string                 `json:"availabilityZone"`
		CachesDir                      string                 `json:"cachesDir"`
		CheckForNewDeploymentEverySecs uint                   `json:"checkForNewDeploymentEverySecs"`
		CleanUpTaskDirs                bool                   `json:"cleanUpTaskDirs"`
		ClientID                       string                 `json:"clientId"`
		DeploymentID                   string                 `json:"deploymentId"`
		DisableReboots                 bool                   `json:"disableReboots"`
		DownloadsDir                   string                 `json:"downloadsDir"`
		Ed25519SigningKeyLocation      string                 `json:"ed25519SigningKeyLocation"`
		IdleTimeoutSecs                uint                   `json:"idleTimeoutSecs"`
		InstanceID                     string                 `json:"instanceId"`
		InstanceType                   string                 `json:"instanceType"`
		LiveLogExecutable              string                 `json:"livelogExecutable"`
		NumberOfTasksToRun             uint                   `json:"numberOfTasksToRun"`
		PrivateIP                      net.IP                 `json:"privateIP"`
		ProvisionerID                  string                 `json:"provisionerId"`
		PublicIP                       net.IP                 `json:"publicIP"`
		Region                         string                 `json:"region"`
		RequiredDiskSpaceMegabytes     uint                   `json:"requiredDiskSpaceMegabytes"`
		RootURL                        string                 `json:"rootURL"`
		RunAfterUserCreation           string                 `json:"runAfterUserCreation"`
		SentryProject                  string                 `json:"sentryProject"`
		ShutdownMachineOnIdle          bool                   `json:"shutdownMachineOnIdle"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		TaskclusterProxyExecutable     string                 `json:"taskclusterProxyExecutable"`
		TaskclusterProxyPort           uint16                 `json:"taskclusterProxyPort"`
		TasksDir                       string                 `json:"tasksDir"`
		WorkerGroup                    string                 `json:"workerGroup"`
		WorkerID                       string                 `json:"workerId"`
		WorkerLocation                 string                 `json:"workerLocation,omitempty"`
		WorkerType                     string                 `json:"workerType"`
		WorkerTypeMetadata             map[string]interface{} `json:"workerTypeMetadata"`
		WSTAudience                    string                 `json:"wstAudience"`
		WSTServerURL                   string                 `json:"wstServerURL"`
	}

	PrivateConfig struct {
		AccessToken string `json:"accessToken"`
		Certificate string `json:"certificate"`
	}

	MissingConfigError struct {
		Setting string
	}
)

func (c *Config) String() string {
	// This json.Marshal call won't sort all inherited properties
	// alphabetically, since it sorts properties within each nested struct, but
	// concatenates the results from each of the nested structs together.
	// Therefore we need to flatten the data structure first before marshaling
	// into json in order to have all properties sorted alphabetically. We do
	// this by first marshaling to json, then unmarshaling to an interface{}
	// (so that the structure is flattened), and then finally marshaling back
	// to json. Whew.
	j, err := json.Marshal(&c.PublicConfig)
	if err != nil {
		panic(err)
	}
	var data interface{}
	err = json.Unmarshal(j, &data)
	if err != nil {
		panic(err)
	}

	j, err = json.MarshalIndent(data, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(j)
}

func (c *Config) Validate() error {
	// TODO: we should be using json schema here

	fields := []struct {
		value      interface{}
		name       string
		disallowed interface{}
	}{
		{value: c.AccessToken, name: "accessToken", disallowed: ""},
		{value: c.CachesDir, name: "cachesDir", disallowed: ""},
		{value: c.ClientID, name: "clientId", disallowed: ""},
		{value: c.DownloadsDir, name: "downloadsDir", disallowed: ""},
		{value: c.Ed25519SigningKeyLocation, name: "ed25519SigningKeyLocation", disallowed: ""},
		{value: c.LiveLogExecutable, name: "livelogExecutable", disallowed: ""},
		{value: c.ProvisionerID, name: "provisionerId", disallowed: ""},
		{value: c.RootURL, name: "rootURL", disallowed: ""},
		{value: c.TasksDir, name: "tasksDir", disallowed: ""},
		{value: c.WorkerGroup, name: "workerGroup", disallowed: ""},
		{value: c.WorkerID, name: "workerId", disallowed: ""},
		{value: c.WorkerType, name: "workerType", disallowed: ""},
	}

	for _, f := range fields {
		if reflect.DeepEqual(f.value, f.disallowed) {
			return MissingConfigError{Setting: f.name}
		}
	}

	// all required config set!
	return nil
}

func (err MissingConfigError) Error() string {
	return "Config setting \"" + err.Setting + "\" has not been defined"
}

func (c *Config) Credentials() *tcclient.Credentials {
	c.credsMutex.Lock()
	creds := &tcclient.Credentials{
		AccessToken: c.AccessToken,
		ClientID:    c.ClientID,
		Certificate: c.Certificate,
	}
	c.credsMutex.Unlock()
	return creds
}

func (c *Config) UpdateCredentials(creds *tcclient.Credentials) {
	c.credsMutex.Lock()
	c.ClientID = creds.ClientID
	c.AccessToken = creds.AccessToken
	c.Certificate = creds.Certificate
	log.Printf("Using new worker credentials with clientId %s", creds.ClientID)
	c.credsMutex.Unlock()
}

type File struct {
	Path string
}

func (cf *File) NewestDeploymentID() (string, error) {
	configData, err := ioutil.ReadFile(cf.Path)
	if err != nil {
		return "", err
	}
	var tempConfig Config
	err = json.Unmarshal(configData, &tempConfig)
	if err != nil {
		return "", err
	}
	return tempConfig.DeploymentID, nil
}

func (cf *File) UpdateConfig(c *Config) error {
	log.Printf("Loading generic-worker config file '%v'...", cf.Path)
	configData, err := ioutil.ReadFile(cf.Path)
	if err != nil {
		return err
	}
	buffer := bytes.NewBuffer(configData)
	decoder := json.NewDecoder(buffer)
	decoder.DisallowUnknownFields()
	var newConfig Config
	err = decoder.Decode(&newConfig)
	if err != nil {
		// An error here is serious - it means the file existed but was invalid
		return fmt.Errorf("Error unmarshaling generic worker config file %v as JSON: %v", cf.Path, err)
	}
	err = c.MergeInJSON(configData, func(a map[string]interface{}) map[string]interface{} {
		return a
	})
	if err != nil {
		return fmt.Errorf("Error overlaying config file %v on top of defaults: %v", cf.Path, err)
	}
	return nil
}

// Persist writes config to json file
func (cf *File) Persist(c *Config) error {
	log.Print("Creating file " + cf.Path + "...")
	return fileutil.WriteToFileAsJSON(c, cf.Path)
}

func (cf *File) DoesNotExist() bool {
	_, err := os.Stat(cf.Path)
	return err != nil && os.IsNotExist(err)
}
