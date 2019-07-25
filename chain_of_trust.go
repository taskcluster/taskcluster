// +build multiuser

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"

	"golang.org/x/crypto/ed25519"

	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

const (
	// ChainOfTrustKeyNotSecureMessage contains message to log when chain of
	// trust key is discovered at runtime not to be secure
	ChainOfTrustKeyNotSecureMessage = "Was expecting attempt to read private chain of trust key as task user to fail - however, it did not!"
)

var (
	certifiedLogPath      = filepath.Join("generic-worker", "certified.log")
	certifiedLogName      = "public/logs/certified.log"
	unsignedCertPath      = filepath.Join("generic-worker", "chain-of-trust.json")
	unsignedCertName      = "public/chain-of-trust.json"
	ed25519SignedCertPath = filepath.Join("generic-worker", "chain-of-trust.json.sig")
	ed25519SignedCertName = "public/chain-of-trust.json.sig"
)

type ChainOfTrustFeature struct {
	Ed25519PrivateKey ed25519.PrivateKey
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
	Version     int                            `json:"chainOfTrustVersion"`
	Artifacts   map[string]ArtifactHash        `json:"artifacts"`
	Task        tcqueue.TaskDefinitionResponse `json:"task"`
	TaskID      string                         `json:"taskId"`
	RunID       uint                           `json:"runId"`
	WorkerGroup string                         `json:"workerGroup"`
	WorkerID    string                         `json:"workerId"`
	Environment CoTEnvironment                 `json:"environment"`
}

type ChainOfTrustTaskFeature struct {
	task           *TaskRun
	ed25519PrivKey ed25519.PrivateKey
}

func (feature *ChainOfTrustFeature) Name() string {
	return "Chain of Trust"
}

func (feature *ChainOfTrustFeature) PersistState() error {
	return nil
}

func (feature *ChainOfTrustFeature) Initialise() (err error) {
	feature.Ed25519PrivateKey, err = readEd25519PrivateKeyFromFile(config.Ed25519SigningKeyLocation)
	if err != nil {
		return
	}

	// platform-specific mechanism to lock down file permissions
	// of private signing key
	err = fileutil.SecureFiles([]string{
		config.Ed25519SigningKeyLocation,
	})
	return
}

func (feature *ChainOfTrustFeature) IsEnabled(task *TaskRun) bool {
	return task.Payload.Features.ChainOfTrust
}

func (feature *ChainOfTrustFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &ChainOfTrustTaskFeature{
		task:           task,
		ed25519PrivKey: feature.Ed25519PrivateKey,
	}
}

func (feature *ChainOfTrustTaskFeature) ReservedArtifacts() []string {
	return []string{
		unsignedCertName,
		ed25519SignedCertName,
		certifiedLogName,
	}
}

func (feature *ChainOfTrustTaskFeature) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (feature *ChainOfTrustTaskFeature) Start() *CommandExecutionError {
	// Return an error if the task user can read the private key file.
	// We shouldn't be able to read the private key, if we can let's raise
	// MalformedPayloadError, as it could be a problem with the task definition
	// (for example, enabling chainOfTrust on a worker type that has
	// runTasksAsCurrentUser enabled).
	err := feature.ensureTaskUserCantReadPrivateCotKey()
	if err != nil {
		return MalformedPayloadError(err)
	}
	return nil
}

func (feature *ChainOfTrustTaskFeature) Stop(err *ExecutionErrors) {
	logFile := filepath.Join(taskContext.TaskDir, logPath)
	certifiedLogFile := filepath.Join(taskContext.TaskDir, certifiedLogPath)
	unsignedCert := filepath.Join(taskContext.TaskDir, unsignedCertPath)
	ed25519SignedCert := filepath.Join(taskContext.TaskDir, ed25519SignedCertPath)
	copyErr := copyFileContents(logFile, certifiedLogFile)
	if copyErr != nil {
		panic(copyErr)
	}
	err.add(feature.task.uploadLog(certifiedLogName, certifiedLogPath))
	artifactHashes := map[string]ArtifactHash{}
	for _, artifact := range feature.task.Artifacts {
		switch a := artifact.(type) {
		case *S3Artifact:
			// make sure SHA256 is calculated
			file := filepath.Join(taskContext.TaskDir, a.Path)
			hash, hashErr := fileutil.CalculateSHA256(file)
			if hashErr != nil {
				panic(hashErr)
			}
			artifactHashes[a.Name] = ArtifactHash{
				SHA256: hash,
			}
		}
	}

	cotCert := &ChainOfTrustData{
		Version:     1,
		Artifacts:   artifactHashes,
		Task:        feature.task.Definition,
		TaskID:      feature.task.TaskID,
		RunID:       feature.task.RunID,
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
	// create unsigned chain-of-trust.json
	e = ioutil.WriteFile(unsignedCert, certBytes, 0644)
	if e != nil {
		panic(e)
	}
	err.add(feature.task.uploadLog(unsignedCertName, unsignedCertPath))

	// create detached ed25519 chain-of-trust.json.sig
	sig := ed25519.Sign(feature.ed25519PrivKey, certBytes)
	e = ioutil.WriteFile(ed25519SignedCert, sig, 0644)
	if e != nil {
		panic(e)
	}
	err.add(feature.task.uploadArtifact(
		&S3Artifact{
			BaseArtifact: &BaseArtifact{
				Name:    ed25519SignedCertName,
				Expires: feature.task.Definition.Expires,
			},
			ContentType:     "application/octet-stream",
			ContentEncoding: "gzip",
			Path:            ed25519SignedCertPath,
		},
	))
}

func (cot *ChainOfTrustTaskFeature) ensureTaskUserCantReadPrivateCotKey() error {
	c, err := cot.catCotKeyCommand()
	if err != nil {
		panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key %v - %v", config.Ed25519SigningKeyLocation, err))
	}
	r := c.Execute()
	if !r.Failed() {
		log.Print(r.String())
		return errors.New(ChainOfTrustKeyNotSecureMessage)
	}
	return nil
}
