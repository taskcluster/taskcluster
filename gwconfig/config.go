package gwconfig

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"reflect"
	"runtime"

	"github.com/taskcluster/generic-worker/fileutil"
)

type (
	// Generic Worker config
	Config struct {
		AccessToken                    string                 `json:"accessToken"`
		AuthBaseURL                    string                 `json:"authBaseURL"`
		AvailabilityZone               string                 `json:"availabilityZone"`
		CachesDir                      string                 `json:"cachesDir"`
		Certificate                    string                 `json:"certificate"`
		CheckForNewDeploymentEverySecs uint                   `json:"checkForNewDeploymentEverySecs"`
		CleanUpTaskDirs                bool                   `json:"cleanUpTaskDirs"`
		ClientID                       string                 `json:"clientId"`
		DeploymentID                   string                 `json:"deploymentId"`
		DisableReboots                 bool                   `json:"disableReboots"`
		DownloadsDir                   string                 `json:"downloadsDir"`
		IdleTimeoutSecs                uint                   `json:"idleTimeoutSecs"`
		InstanceID                     string                 `json:"instanceId"`
		InstanceType                   string                 `json:"instanceType"`
		LiveLogCertificate             string                 `json:"livelogCertificate"`
		LiveLogExecutable              string                 `json:"livelogExecutable"`
		LiveLogGETPort                 uint16                 `json:"livelogGETPort"`
		LiveLogKey                     string                 `json:"livelogKey"`
		LiveLogPUTPort                 uint16                 `json:"livelogPUTPort"`
		LiveLogSecret                  string                 `json:"livelogSecret"`
		NumberOfTasksToRun             uint                   `json:"numberOfTasksToRun"`
		PrivateIP                      net.IP                 `json:"privateIP"`
		ProvisionerBaseURL             string                 `json:"provisionerBaseURL"`
		ProvisionerID                  string                 `json:"provisionerId"`
		PublicIP                       net.IP                 `json:"publicIP"`
		PurgeCacheBaseURL              string                 `json:"purgeCacheBaseURL"`
		QueueBaseURL                   string                 `json:"queueBaseURL"`
		Region                         string                 `json:"region"`
		RequiredDiskSpaceMegabytes     uint                   `json:"requiredDiskSpaceMegabytes"`
		RunAfterUserCreation           string                 `json:"runAfterUserCreation"`
		RunTasksAsCurrentUser          bool                   `json:"runTasksAsCurrentUser"`
		SentryProject                  string                 `json:"sentryProject"`
		ShutdownMachineOnIdle          bool                   `json:"shutdownMachineOnIdle"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		SigningKeyLocation             string                 `json:"signingKeyLocation"`
		Subdomain                      string                 `json:"subdomain"`
		TaskclusterProxyExecutable     string                 `json:"taskclusterProxyExecutable"`
		TaskclusterProxyPort           uint16                 `json:"taskclusterProxyPort"`
		TasksDir                       string                 `json:"tasksDir"`
		WorkerGroup                    string                 `json:"workerGroup"`
		WorkerID                       string                 `json:"workerId"`
		WorkerType                     string                 `json:"workerType"`
		WorkerTypeMetadata             map[string]interface{} `json:"workerTypeMetadata"`
	}

	MissingConfigError struct {
		Setting string
	}
)

// writes config to json file
func (c *Config) Persist(file string) error {
	log.Print("Creating file " + file + "...")
	return fileutil.WriteToFileAsJSON(c, file)
}

func (c *Config) String() string {
	cCopy := *c
	cCopy.AccessToken = "*************"
	cCopy.LiveLogSecret = "*************"
	json, err := json.MarshalIndent(&cCopy, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(json)
}

func (c *Config) Validate() error {
	// TODO: could probably do this with reflection to avoid explicitly listing
	// all members

	fields := []struct {
		value      interface{}
		name       string
		disallowed interface{}
	}{
		{value: c.AccessToken, name: "accessToken", disallowed: ""},
		{value: c.CachesDir, name: "cachesDir", disallowed: ""},
		{value: c.ClientID, name: "clientId", disallowed: ""},
		{value: c.DownloadsDir, name: "downloadsDir", disallowed: ""},
		{value: c.LiveLogExecutable, name: "livelogExecutable", disallowed: ""},
		{value: c.LiveLogPUTPort, name: "livelogPUTPort", disallowed: 0},
		{value: c.LiveLogGETPort, name: "livelogGETPort", disallowed: 0},
		{value: c.LiveLogSecret, name: "livelogSecret", disallowed: ""},
		{value: c.ProvisionerID, name: "provisionerId", disallowed: ""},
		{value: c.PublicIP, name: "publicIP", disallowed: net.IP(nil)},
		{value: c.SigningKeyLocation, name: "signingKeyLocation", disallowed: ""},
		{value: c.Subdomain, name: "subdomain", disallowed: ""},
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

	// Platform specific checks...
	if runtime.GOOS != "windows" && !c.RunTasksAsCurrentUser {
		return fmt.Errorf("Only Windows platform supports running tasks as different users, config setting 'runTasksAsCurrentUser' must be set to true, but is currently set to false; detected platform is %v", runtime.GOOS)
	}
	// all required config set!
	return nil
}

func (err MissingConfigError) Error() string {
	return "Config setting \"" + err.Setting + "\" has not been defined"
}
