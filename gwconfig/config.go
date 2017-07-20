package gwconfig

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net"
)

type (

	// Generic Worker config
	Config struct {
		AccessToken                    string                 `json:"accessToken"`
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
		SentryProject                  string                 `json:"sentryProject"`
		PrivateIP                      net.IP                 `json:"privateIP"`
		ProvisionerID                  string                 `json:"provisionerId"`
		PublicIP                       net.IP                 `json:"publicIP"`
		RefreshUrlsPrematurelySecs     uint                   `json:"refreshURLsPrematurelySecs"`
		Region                         string                 `json:"region"`
		RequiredDiskSpaceMegabytes     uint                   `json:"requiredDiskSpaceMegabytes"`
		RunAfterUserCreation           string                 `json:"runAfterUserCreation"`
		RunTasksAsCurrentUser          bool                   `json:"runTasksAsCurrentUser"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		ShutdownMachineOnIdle          bool                   `json:"shutdownMachineOnIdle"`
		SigningKeyLocation             string                 `json:"signingKeyLocation"`
		Subdomain                      string                 `json:"subdomain"`
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
	return WriteToFileAsJSON(c, file)
}

func WriteToFileAsJSON(obj interface{}, filename string) error {
	jsonBytes, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	log.Printf("Saving file %v with content:\n%v\n", filename, string(jsonBytes))
	return ioutil.WriteFile(filename, append(jsonBytes, '\n'), 0644)
}
