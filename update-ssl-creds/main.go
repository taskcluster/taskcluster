package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
)

const (
	oldBase64EncodedCert = "***"
	newBase64EncodedCert = "***"
	oldBase64EncodedKey  = "###"
	newBase64EncodedKey  = "###"
)

func main() {
	prov := awsprovisioner.New(
		&tcclient.Credentials{
			AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
			ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		},
	)

	workerTypes, err := prov.ListWorkerTypes()
	if err != nil {
		panic(err)
	}
	for _, wt := range *workerTypes {
		changed := false
		log.Printf("Querying worker type %v...", wt)
		def, err := prov.WorkerType(wt)
		if err != nil {
			panic(err)
		}
		secrets := def.Secrets
		var s map[string]interface{}
		err = json.Unmarshal(secrets, &s)
		if err != nil {
			panic(err)
		}
		if s["files"] != nil {
			for _, f := range s["files"].([]interface{}) {
				tf := f.(map[string]interface{})
				switch tf["content"] {
				case oldBase64EncodedCert:
					tf["content"] = newBase64EncodedCert
					changed = true
					log.Printf("Old cert found in worker type %v", wt)
				case oldBase64EncodedKey:
					tf["content"] = newBase64EncodedKey
					changed = true
					log.Printf("Old key found in worker type %v", wt)
				}
			}
		}
		if changed {
			gw := s["generic-worker"].(map[string]interface{})
			conf := gw["config"].(map[string]interface{})
			oldDeploymentId := conf["deploymentId"].(string)
			newDeploymentId := slugid.Nice()
			log.Printf("New deploymentId for %v: %v => %v", wt, oldDeploymentId, newDeploymentId)
			conf["deploymentId"] = newDeploymentId
			newBase64EncodedBytes, err := json.Marshal(s)
			if err != nil {
				panic(err)
			}
			var rm json.RawMessage
			err = json.Unmarshal(newBase64EncodedBytes, &rm)
			if err != nil {
				panic(err)
			}
			def.Secrets = rm
			allBytes, err := json.Marshal(def)
			if err != nil {
				panic(err)
			}

			var req awsprovisioner.CreateWorkerTypeRequest
			err = json.Unmarshal(allBytes, &req)
			if err != nil {
				panic(err)
			}
			log.Printf("Updating working type %v...", wt)
			_, err = prov.UpdateWorkerType(wt, &req)
			if err != nil {
				panic(err)
			}
		}
	}
}
