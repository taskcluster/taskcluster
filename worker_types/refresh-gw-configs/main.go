package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
)

type AWSSecrets struct {
	GW *struct {
		C *gwconfig.Config `json:"config"`
	} `json:"generic-worker"`
}

type OCCManifest struct {
	Components []struct {
		ComponentName string
		Validate      struct {
			CommandsReturn []struct {
				Match string
			}
		}
	}
}

func main() {
	prov := tcawsprovisioner.NewFromEnv()
	allWorkerTypes, err := prov.ListWorkerTypes()
	if err != nil {
		panic(err)
	}

	for _, wt := range *allWorkerTypes {
		resp, err := prov.WorkerType(wt)
		if err != nil {
			panic(err)
		}
		var s AWSSecrets
		err = json.Unmarshal(resp.Secrets, &s)
		if err != nil {
			panic(err)
		}
		if s.GW == nil {
			continue
		}
		fmt.Println("")
		fmt.Println(wt)
		targetConfig := &gwconfig.Config{
			// The following all set automatically
			// for aws-provisioner-v1 worker types
			//
			// AccessToken:                    "",
			// Certificate:                    "",
			// ClientID:                       "",
			// InstanceID:                     "",
			// InstanceType:                   "",
			// PrivateIP:                      nil,
			// PublicIP:                       nil,
			// Region:                         "",
			// WorkerGroup:                    "",
			// WorkerID:                       "",
			// WorkerType:                     "",
			PublicConfig: gwconfig.PublicConfig{
				CachesDir:                      "",
				CheckForNewDeploymentEverySecs: 0,
				CleanUpTaskDirs:                true,
				DeploymentID:                   "",
				DisableReboots:                 true,
				DownloadsDir:                   "",
				Ed25519SigningKeyLocation:      "",
				IdleTimeoutSecs:                7200,
				LiveLogCertificate:             "C:\\generic-worker\\livelog.crt",
				LiveLogExecutable:              "C:\\generic-worker\\livelog.exe",
				LiveLogGETPort:                 64724,
				LiveLogKey:                     "C:\\generic-worker\\livelog.key",
				LiveLogPUTPort:                 1234,
				NumberOfTasksToRun:             0,
				OpenPGPSigningKeyLocation:      "",
				SentryProject:                  "generic-worker",
				ProvisionerID:                  "",
				RequiredDiskSpaceMegabytes:     3,
				RunAfterUserCreation:           "",
				RunTasksAsCurrentUser:          true,
				ShutdownMachineOnInternalError: true,
				ShutdownMachineOnIdle:          true,
				Subdomain:                      "",
				TasksDir:                       "",
				WorkerTypeMetadata:             map[string]interface{}{},
			},
			PrivateConfig: gwconfig.PrivateConfig{
				// LiveLogSecret:                  "",
			},
		}

		if ms, ok := s.GW.C.WorkerTypeMetadata["machine-setup"]; ok {
			if manifest, ok := ms.(map[string]interface{})["manifest"]; ok {
				url := manifest.(string)
				fmt.Println(url)
				url = strings.Replace(
					url,
					"github.com/mozilla-releng/OpenCloudConfig/blob",
					"raw.githubusercontent.com/mozilla-releng/OpenCloudConfig",
					-1,
				)
				fmt.Println(url)
				resp, err := http.Get(url)
				if err != nil {
					panic(err)
				}
				defer resp.Body.Close()
				decoder := json.NewDecoder(resp.Body)
				var occ OCCManifest
				err = decoder.Decode(&occ)
				if err != nil {
					panic(err)
				}
				for _, comp := range occ.Components {
					if comp.ComponentName == "GenericWorkerInstall" {
						for _, cr := range comp.Validate.CommandsReturn {
							fmt.Println(cr.Match)
							switch {
							case strings.HasPrefix(cr.Match, "generic-worker 10."):
								targetConfig.CachesDir = "Y:\\Caches"
							case strings.HasPrefix(cr.Match, "generic-worker "):
								targetConfig.CachesDir = "Z:\\Caches"
							}
						}
					}
				}
			}
		}
		targetConfig.LiveLogSecret = s.GW.C.LiveLogSecret
		b, err := json.MarshalIndent(s.GW.C, "", "  ")
		if err != nil {
			panic(err)
		}
		fmt.Printf("%v\n", string(b))
		b, err = json.MarshalIndent(targetConfig, "", "  ")
		if err != nil {
			panic(err)
		}
		fmt.Printf("%v\n", string(b))
	}
}
