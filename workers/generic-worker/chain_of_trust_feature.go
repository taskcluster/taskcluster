//go:build multiuser

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/peterbourgon/mergemap"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"golang.org/x/crypto/ed25519"
)

const (
	// ChainOfTrustKeyNotSecureMessage contains message to log when chain of
	// trust key is discovered at runtime not to be secure
	ChainOfTrustKeyNotSecureMessage = "was expecting attempt to read private chain of trust key as task user to fail - however, it did not"
)

var (
	certifiedLogPath      = filepath.Join("generic-worker", "certified.log")
	certifiedLogName      = "public/logs/certified.log"
	unsignedCertPath      = filepath.Join("generic-worker", "chain-of-trust.json")
	unsignedCertName      = "public/chain-of-trust.json"
	ed25519SignedCertPath = filepath.Join("generic-worker", "chain-of-trust.json.sig")
	ed25519SignedCertName = "public/chain-of-trust.json.sig"
	additionalDataPath    = "chain-of-trust-additional-data.json"
)

type (
	ChainOfTrustFeature struct {
		Ed25519PrivateKey ed25519.PrivateKey
	}

	ArtifactHash struct {
		SHA256 string `json:"sha256"`
	}

	CoTEnvironment struct {
		PublicIPAddress  string `json:"publicIpAddress,omitempty"`
		PrivateIPAddress string `json:"privateIpAddress"`
		InstanceID       string `json:"instanceId"`
		InstanceType     string `json:"instanceType"`
		Region           string `json:"region"`
	}

	ChainOfTrustData struct {
		Version     int                            `json:"chainOfTrustVersion"`
		Artifacts   map[string]ArtifactHash        `json:"artifacts"`
		Task        tcqueue.TaskDefinitionResponse `json:"task"`
		TaskID      string                         `json:"taskId"`
		RunID       uint                           `json:"runId"`
		WorkerGroup string                         `json:"workerGroup"`
		WorkerID    string                         `json:"workerId"`
		Environment CoTEnvironment                 `json:"environment"`
	}

	ChainOfTrustTaskFeature struct {
		task           *TaskRun
		ed25519PrivKey ed25519.PrivateKey
		disabled       bool
	}

	MissingED25519PrivateKey struct {
		Err error
	}
)

func (m *MissingED25519PrivateKey) Error() string {
	return fmt.Sprintf("Missing ED25519 Private Key: %v", m.Err)
}

func (feature *ChainOfTrustFeature) Name() string {
	return "Chain of Trust"
}

func (feature *ChainOfTrustFeature) Initialise() (err error) {
	feature.Ed25519PrivateKey, err = readEd25519PrivateKeyFromFile(config.Ed25519SigningKeyLocation)
	if err != nil {
		return &MissingED25519PrivateKey{
			Err: err,
		}
	}

	// platform-specific mechanism to lock down file permissions
	// of private signing key
	err = fileutil.SecureFiles(config.Ed25519SigningKeyLocation)
	return
}

func (feature *ChainOfTrustFeature) IsEnabled() bool {
	return config.EnableChainOfTrust
}

func (feature *ChainOfTrustFeature) IsRequested(task *TaskRun) bool {
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
	// (for example, enabling chainOfTrust when runTaskAsCurrentUser is enabled).
	err := feature.ensureTaskUserCantReadPrivateCotKey()
	if err != nil {
		feature.disabled = true
		return MalformedPayloadError(err)
	}
	return nil
}

func (feature *ChainOfTrustTaskFeature) Stop(err *ExecutionErrors) {
	if feature.disabled {
		return
	}
	taskDir := feature.task.TaskDir()
	logFile := filepath.Join(taskDir, logPath)
	certifiedLogFile := filepath.Join(taskDir, certifiedLogPath)
	unsignedCert := filepath.Join(taskDir, unsignedCertPath)
	ed25519SignedCert := filepath.Join(taskDir, ed25519SignedCertPath)
	copyErr := copyFileContents(logFile, certifiedLogFile)
	if copyErr != nil {
		panic(copyErr)
	}
	err.add(feature.task.uploadLog(certifiedLogName, filepath.Join(taskDir, certifiedLogPath)))
	artifactHashes := map[string]ArtifactHash{}
	feature.task.artifactsMux.RLock()
	for _, artifact := range feature.task.Artifacts {
		// make sure SHA256 is calculated
		switch a := artifact.(type) {
		case *artifacts.S3Artifact:
			hash, hashErr := fileutil.CalculateSHA256(a.Path)
			if hashErr != nil {
				panic(hashErr)
			}
			artifactHashes[a.Name] = ArtifactHash{
				SHA256: hash,
			}
		case *artifacts.ObjectArtifact:
			hash, hashErr := fileutil.CalculateSHA256(a.Path)
			if hashErr != nil {
				panic(hashErr)
			}
			artifactHashes[a.Name] = ArtifactHash{
				SHA256: hash,
			}
		}
	}
	feature.task.artifactsMux.RUnlock()

	cotCert := &ChainOfTrustData{
		Version:     1,
		Artifacts:   artifactHashes,
		Task:        feature.task.TaskClaimResponse.Task,
		TaskID:      feature.task.TaskID,
		RunID:       feature.task.RunID,
		WorkerGroup: config.WorkerGroup,
		WorkerID:    config.WorkerID,
		Environment: CoTEnvironment{
			PrivateIPAddress: config.PrivateIP.String(),
			InstanceID:       config.InstanceID,
			InstanceType:     config.InstanceType,
			Region:           config.Region,
		},
	}

	if config.PublicIP != nil {
		cotCert.Environment.PublicIPAddress = config.PublicIP.String()
	}

	certBytes, e := json.MarshalIndent(cotCert, "", "  ")
	if e != nil {
		panic(e)
	}

	certBytes, e = feature.MergeAdditionalData(certBytes)
	if e != nil {
		panic(e)
	}

	// create unsigned chain-of-trust.json
	e = os.WriteFile(unsignedCert, certBytes, 0644)
	if e != nil {
		panic(e)
	}
	err.add(feature.task.uploadLog(unsignedCertName, filepath.Join(taskDir, unsignedCertPath)))

	// create detached ed25519 chain-of-trust.json.sig
	sig := ed25519.Sign(feature.ed25519PrivKey, certBytes)
	e = os.WriteFile(ed25519SignedCert, sig, 0644)
	if e != nil {
		panic(e)
	}
	err.add(feature.task.uploadArtifact(
		createDataArtifact(
			&artifacts.BaseArtifact{
				Name:    ed25519SignedCertName,
				Expires: feature.task.TaskClaimResponse.Task.Expires,
			},
			filepath.Join(taskDir, ed25519SignedCertPath),
			filepath.Join(taskDir, ed25519SignedCertPath),
			"application/octet-stream",
			"gzip",
		),
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

func (cot *ChainOfTrustTaskFeature) MergeAdditionalData(certBytes []byte) (mergedCert []byte, err error) {
	additionalDataFile := filepath.Join(cot.task.TaskDir(), additionalDataPath)

	// Additional data is optional, if file hasn't been created by task, just return the original data
	if _, err = os.Stat(additionalDataFile); errors.Is(err, os.ErrNotExist) {
		return certBytes, nil
	}

	// Ensure task user can read the data (e.g. in case somebody creates a symbolic link to a json file owned by root)
	tempPath, err := copyToTempFileAsTaskUser(additionalDataFile, cot.task.pd, cot.task.TaskDir())
	if err != nil {
		return
	}
	defer os.Remove(tempPath)

	var additionalDataBytes []byte
	additionalDataBytes, err = os.ReadFile(tempPath)
	if err != nil {
		return
	}

	initialCert := map[string]any{}
	additionalData := map[string]any{}

	err = json.Unmarshal(additionalDataBytes, &additionalData)
	if err != nil {
		// If for any reason the task-generated file isn't valid json, this should generate an error
		return
	}

	err = json.Unmarshal(certBytes, &initialCert)
	if err != nil {
		return
	}

	// the order is important here - initialCert takes precedence over
	// additionalData, in the case that they both contain the same property
	mergedMap := mergemap.Merge(additionalData, initialCert)

	return json.MarshalIndent(mergedMap, "", "  ")
}
