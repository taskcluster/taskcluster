package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster-client-go/secrets"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func main() {
	sshSecret := make(map[string]string)
	if len(os.Args) != 2 {
		log.Fatal("Usage: " + os.Args[0] + " WORKER_TYPE_DIRECTORY")
	}
	workerTypeDir := os.Args[1]
	workerType := filepath.Base(workerTypeDir)
	secretName := "project/taskcluster/aws-provisioner-v1/" + workerType + "/ssh-keys"
	files, err := ioutil.ReadDir(workerTypeDir)
	if err != nil {
		absFile, err2 := filepath.Abs(workerTypeDir)
		if err2 != nil {
			log.Fatalf("File/directory '%v' could not be read due to '%s'", workerTypeDir, err)
		} else {
			log.Fatalf("File/directory '%v' (%v) could not be read due to '%s'", workerTypeDir, absFile, err)
		}
	}
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".id_rsa") {
			region := f.Name()[:len(f.Name())-7]
			bytes, err := ioutil.ReadFile(filepath.Join(workerTypeDir, f.Name()))
			if err != nil {
				log.Fatalf("Problem reading file %v", filepath.Join(workerTypeDir, f.Name()))
			}
			sshSecret[region] = string(bytes)
		}
	}

	mySecrets := secrets.New(
		&tcclient.Credentials{
			ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
			AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
		},
	)

	secBytes, err := json.Marshal(sshSecret)
	if err != nil {
		log.Fatalf("Could not convert secret %#v to json: %v", sshSecret, err)
	}

	_, err = mySecrets.Set(
		secretName,
		&secrets.Secret{
			Expires: tcclient.Time(time.Now().AddDate(1, 0, 0)),
			Secret:  json.RawMessage(secBytes),
		},
	)
	if err != nil {
		log.Printf("Problem publishing new secrets: %v", err)
	}
	s, _, err := mySecrets.Get(secretName)
	if err != nil {
		log.Fatalf("Error retrieving secret: %v", err)
	}
	log.Print("Secret name:  " + secretName)
	log.Print("Secret value: " + string(s.Secret))
	log.Print("Expiry:       " + s.Expires.String())
}
