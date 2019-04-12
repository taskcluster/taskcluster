package main

import (
	"encoding/json"
	"log"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
	"github.com/taskcluster/taskcluster-client-go/tcsecrets"
)

const (
	oldBase64EncodedCert = "***"
	newBase64EncodedCert = "***"
	oldBase64EncodedKey  = "###"
	newBase64EncodedKey  = "###"
)

func main() {
	prov := tcawsprovisioner.NewFromEnv()
	ss := tcsecrets.NewFromEnv()
	workerTypes, err := prov.ListWorkerTypes()
	if err != nil {
		panic(err)
	}
	for _, wt := range *workerTypes {
		changed := false
		secretName := "worker-type:aws-provisioner-v1/" + wt
		log.Printf("Querying secret %v...", secretName)
		sec, err := ss.Get(secretName)
		if err != nil {
			if apiException, isAPIException := err.(*tcclient.APICallException); isAPIException {
				if apiException.CallSummary.HTTPResponse.StatusCode == 404 {
					log.Printf("WARNING: Secret not found: %v - skipping...", secretName)
					continue
				}
			}
			panic(err)
		}
		secrets := sec.Secret
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
			log.Printf("Updating secret %v...", secretName)
			secretBytes, err := json.Marshal(s)
			if err != nil {
				panic(err)
			}
			var secretRM json.RawMessage
			err = json.Unmarshal(secretBytes, &secretRM)
			if err != nil {
				panic(err)
			}
			sec.Secret = secretRM
			err = ss.Set(secretName, sec)
			if err != nil {
				panic(err)
			}
			log.Printf("Querying worker type %v...", wt)
			def, err := prov.WorkerType(wt)
			if err != nil {
				panic(err)
			}
			var userdata map[string]interface{}
			err = json.Unmarshal(def.UserData, &userdata)
			if err != nil {
				panic(err)
			}
			if userdata["genericWorker"] == nil {
				log.Printf("WARNING: No `userdata.genericWorker` property in worker type definition %v - skipping...", wt)
				continue
			}
			gw := userdata["genericWorker"].(map[string]interface{})
			conf := gw["config"].(map[string]interface{})
			oldDeploymentID := conf["deploymentId"].(string)
			newDeploymentID := slugid.Nice()
			log.Printf("New deploymentId for %v: %v => %v", wt, oldDeploymentID, newDeploymentID)
			conf["deploymentId"] = newDeploymentID
			userdataBytes, err := json.Marshal(userdata)
			if err != nil {
				panic(err)
			}
			var rm json.RawMessage
			err = json.Unmarshal(userdataBytes, &rm)
			if err != nil {
				panic(err)
			}
			def.UserData = rm
			workerTypeDefinitionBytes, err := json.Marshal(def)
			if err != nil {
				panic(err)
			}
			var req tcawsprovisioner.CreateWorkerTypeRequest
			err = json.Unmarshal(workerTypeDefinitionBytes, &req)
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
