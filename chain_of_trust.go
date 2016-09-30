package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/crypto/openpgp"
	"golang.org/x/crypto/openpgp/clearsign"

	"github.com/taskcluster/taskcluster-base-go/scopes"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type ChainOfTrustFeature struct {
}

type ArtifactHash struct {
	SHA256 string `json:"sha256"`
}

type CoTEnvironment struct {
	PublicIPAddress  string `json:"publicIpAddress"`
	PrivateIPAddress string `json:"privateIpAddress"`
	InstanceID       string `json:"instanceId"`
	InstanceType     string `json:"instanceType"`
	Region           string `json:"region"`
}

type ChainOfTrustData struct {
	Version     int                          `json:"chainOfTrustVersion"`
	Artifacts   map[string]ArtifactHash      `json:"artifacts"`
	Task        queue.TaskDefinitionResponse `json:"task"`
	TaskID      string                       `json:"taskId"`
	RunID       uint                         `json:"runId"`
	WorkerGroup string                       `json:"workerGroup"`
	WorkerID    string                       `json:"workerId"`
	Environment CoTEnvironment               `json:"environment"`
}

type ChainOfTrustTaskFeature struct {
	task *TaskRun
}

func (feature *ChainOfTrustFeature) Name() string {
	return "Chain of Trust"
}

func (feature *ChainOfTrustFeature) Initialise() error {
	return nil
}

func (feature *ChainOfTrustFeature) IsEnabled(fl EnabledFeatures) bool {
	return fl.ChainOfTrust
}

func (feature *ChainOfTrustFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &ChainOfTrustTaskFeature{
		task: task,
	}
}

func (cot *ChainOfTrustTaskFeature) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (cot *ChainOfTrustTaskFeature) Start() *CommandExecutionError {
	return nil
}

func (cot *ChainOfTrustTaskFeature) Stop() *CommandExecutionError {
	logFile := filepath.Join(TaskUser.HomeDir, "public", "logs", "live_backing.log")
	certifiedLogFile := filepath.Join(TaskUser.HomeDir, "public", "logs", "certified.log")
	signedCert := filepath.Join(TaskUser.HomeDir, "public", "logs", "chainOfTrust.json.asc")
	e := copyFileContents(logFile, certifiedLogFile)
	if e != nil {
		panic(e)
	}
	err := cot.task.uploadLog("public/logs/certified.log")
	if err != nil {
		return err
	}
	artifactHashes := map[string]ArtifactHash{}
	for _, artifact := range cot.task.Artifacts {
		switch a := artifact.(type) {
		case S3Artifact:
			// make sure SHA256 is calculated
			hash, err := calculateHash(a)
			if err != nil {
				panic(err)
			}
			artifactHashes[a.CanonicalPath] = ArtifactHash{
				SHA256: hash,
			}
		}
	}

	cotCert := &ChainOfTrustData{
		Version:     1,
		Artifacts:   artifactHashes,
		Task:        cot.task.Definition,
		TaskID:      cot.task.TaskID,
		RunID:       cot.task.RunID,
		WorkerGroup: config.WorkerGroup,
		WorkerID:    config.WorkerID,
		Environment: CoTEnvironment{
			PublicIPAddress:  config.PublicIP.String(),
			PrivateIPAddress: config.PrivateIP.String(),
			InstanceID:       config.InstanceID,
			InstanceType:     config.InstanceType,
			Region:           config.Region,
		},
	}

	certBytes, e := json.MarshalIndent(cotCert, "", "  ")
	if e != nil {
		panic(e)
	}
	// separate signature from json with a new line
	certBytes = append(certBytes, '\n')

	in := bytes.NewBuffer(certBytes)
	out, e := os.Create(signedCert)
	if e != nil {
		panic(e)
	}
	defer out.Close()

	privKeyFile, e := os.Open(config.SigningKeyLocation)
	if e != nil {
		panic(e)
	}
	defer privKeyFile.Close()
	entityList, e := openpgp.ReadArmoredKeyRing(privKeyFile)
	if e != nil {
		panic(e)
	}
	privKey := entityList[0].PrivateKey
	w, e := clearsign.Encode(out, privKey, nil)
	if e != nil {
		panic(e)
	}
	_, e = io.Copy(w, in)
	if e != nil {
		panic(e)
	}
	w.Close()
	out.Write([]byte{'\n'})
	out.Close()
	err = cot.task.uploadLog("public/logs/chainOfTrust.json.asc")
	if err != nil {
		return err
	}
	return nil
}

func calculateHash(artifact S3Artifact) (hash string, err error) {
	rawContentFile := filepath.Join(TaskUser.HomeDir, artifact.Base().CanonicalPath)
	rawContent, err := os.Open(rawContentFile)
	if err != nil {
		return
	}
	defer rawContent.Close()
	hasher := sha256.New()
	_, err = io.Copy(hasher, rawContent)
	if err != nil {
		panic(err)
	}
	hash = hex.EncodeToString(hasher.Sum(nil))
	return
}
