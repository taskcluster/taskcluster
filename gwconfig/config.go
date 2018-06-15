package gwconfig

import (
	"encoding/json"
	"log"
	"net"

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
