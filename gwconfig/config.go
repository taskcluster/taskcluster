package gwconfig

import (
	"log"
	"net"

	"github.com/taskcluster/generic-worker/fileutil"
)

type (

	// Generic Worker config
	Config struct {
		AccessToken                    string                 `json:"accessToken,omitempty"`
		CachesDir                      string                 `json:"cachesDir,omitempty"`
		Certificate                    string                 `json:"certificate,omitempty"`
		CheckForNewDeploymentEverySecs uint                   `json:"checkForNewDeploymentEverySecs,omitempty"`
		CleanUpTaskDirs                bool                   `json:"cleanUpTaskDirs"`
		ClientID                       string                 `json:"clientId,omitempty"`
		DeploymentID                   string                 `json:"deploymentId,omitempty"`
		DisableReboots                 bool                   `json:"disableReboots"`
		DownloadsDir                   string                 `json:"downloadsDir,omitempty"`
		IdleTimeoutSecs                uint                   `json:"idleTimeoutSecs,omitempty"`
		InstanceID                     string                 `json:"instanceId,omitempty"`
		InstanceType                   string                 `json:"instanceType,omitempty"`
		LiveLogCertificate             string                 `json:"livelogCertificate,omitempty"`
		LiveLogExecutable              string                 `json:"livelogExecutable,omitempty"`
		LiveLogGETPort                 uint16                 `json:"livelogGETPort,omitempty"`
		LiveLogKey                     string                 `json:"livelogKey,omitempty"`
		LiveLogPUTPort                 uint16                 `json:"livelogPUTPort,omitempty"`
		LiveLogSecret                  string                 `json:"livelogSecret,omitempty"`
		NumberOfTasksToRun             uint                   `json:"numberOfTasksToRun,omitempty"`
		SentryProject                  string                 `json:"sentryProject,omitempty"`
		PrivateIP                      net.IP                 `json:"privateIP,omitempty"`
		ProvisionerID                  string                 `json:"provisionerId,omitempty"`
		PublicIP                       net.IP                 `json:"publicIP,omitempty"`
		RefreshUrlsPrematurelySecs     uint                   `json:"refreshURLsPrematurelySecs,omitempty"`
		Region                         string                 `json:"region,omitempty"`
		RequiredDiskSpaceMegabytes     uint                   `json:"requiredDiskSpaceMegabytes,omitempty"`
		RunAfterUserCreation           string                 `json:"runAfterUserCreation,omitempty"`
		RunTasksAsCurrentUser          bool                   `json:"runTasksAsCurrentUser"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		ShutdownMachineOnIdle          bool                   `json:"shutdownMachineOnIdle"`
		SigningKeyLocation             string                 `json:"signingKeyLocation,omitempty"`
		Subdomain                      string                 `json:"subdomain,omitempty"`
		TaskclusterProxyExecutable     string                 `json:"taskclusterProxyExecutable,omitempty"`
		TaskclusterProxyPort           uint16                 `json:"taskclusterProxyPort,omitempty"`
		TasksDir                       string                 `json:"tasksDir,omitempty"`
		WorkerGroup                    string                 `json:"workerGroup,omitempty"`
		WorkerID                       string                 `json:"workerId,omitempty"`
		WorkerType                     string                 `json:"workerType,omitempty"`
		WorkerTypeMetadata             map[string]interface{} `json:"workerTypeMetadata,omitempty"`
	}
)

// writes config to json file
func (c *Config) Persist(file string) error {
	log.Print("Creating file " + file + "...")
	return fileutil.WriteToFileAsJSON(c, file)
}
