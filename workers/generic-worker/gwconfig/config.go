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

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcpurgecache"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/workers/generic-worker/fileutil"
)

type (
	// Generic Worker config
	Config struct {
		PrivateConfig
		PublicConfig
	}

	PublicConfig struct {
		PublicEngineConfig
		AuthRootURL                    string                 `json:"authRootURL"`
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
		PurgeCacheRootURL              string                 `json:"purgeCacheRootURL"`
		QueueRootURL                   string                 `json:"queueRootURL"`
		Region                         string                 `json:"region"`
		RequiredDiskSpaceMegabytes     uint                   `json:"requiredDiskSpaceMegabytes"`
		RootURL                        string                 `json:"rootURL"`
		RunAfterUserCreation           string                 `json:"runAfterUserCreation"`
		SecretsRootURL                 string                 `json:"secretsRootURL"`
		SentryProject                  string                 `json:"sentryProject"`
		ShutdownMachineOnIdle          bool                   `json:"shutdownMachineOnIdle"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		TaskclusterProxyExecutable     string                 `json:"taskclusterProxyExecutable"`
		TaskclusterProxyPort           uint16                 `json:"taskclusterProxyPort"`
		TasksDir                       string                 `json:"tasksDir"`
		WorkerGroup                    string                 `json:"workerGroup"`
		WorkerID                       string                 `json:"workerId"`
		WorkerLocation                 string                 `json:"workerLocation"`
		WorkerManagerRootURL           string                 `json:"workerManagerRootURL"`
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
	cCopy := *c
	cCopy.AccessToken = "*************"
	// This json.Marshal call won't sort all inherited properties
	// alphabetically, since it sorts properties within each nested struct, but
	// concatenates the results from each of the nested structs together.
	// Therefore we need to flatten the data structure first before marshaling
	// into json in order to have all properties sorted alphabetically. We do
	// this by first marshaling to json, then unmarshaling to an interface{}
	// (so that the structure is flattened), and then finally marshaling back
	// to json. Whew.
	j, err := json.Marshal(&cCopy)
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
	return &tcclient.Credentials{
		AccessToken: c.AccessToken,
		ClientID:    c.ClientID,
		Certificate: c.Certificate,
	}
}

func (c *Config) Auth() *tcauth.Auth {
	auth := tcauth.New(c.Credentials(), c.RootURL)
	// If authRootURL provided, it should take precedence over rootURL
	if c.AuthRootURL != "" {
		auth.RootURL = c.AuthRootURL
	}
	return auth
}

func (c *Config) Queue() *tcqueue.Queue {
	queue := tcqueue.New(c.Credentials(), c.RootURL)
	// If queueRootURL provided, it should take precedence over rootURL
	if c.QueueRootURL != "" {
		queue.RootURL = c.QueueRootURL
	}
	return queue
}

func (c *Config) PurgeCache() *tcpurgecache.PurgeCache {
	purgeCache := tcpurgecache.New(c.Credentials(), c.RootURL)
	// If purgeCacheRootURL provided, it should take precedence over rootURL
	if c.PurgeCacheRootURL != "" {
		purgeCache.RootURL = c.PurgeCacheRootURL
	}
	return purgeCache
}

func (c *Config) Secrets() *tcsecrets.Secrets {
	secrets := tcsecrets.New(c.Credentials(), c.RootURL)
	// If secretsRootURL provided, it should take precedence over rootURL
	if c.SecretsRootURL != "" {
		secrets.RootURL = c.SecretsRootURL
	}
	return secrets
}

func (c *Config) WorkerManager() *tcworkermanager.WorkerManager {
	workerManager := tcworkermanager.New(c.Credentials(), c.RootURL)
	// If workerManagerRootURL provided, it should take precedence over rootURL
	if c.WorkerManagerRootURL != "" {
		workerManager.RootURL = c.WorkerManagerRootURL
	}
	return workerManager
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
