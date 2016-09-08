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

func (cot *ChainOfTrustFeature) Initialise() error {
	return nil
}

func (cot *ChainOfTrustFeature) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (cot *ChainOfTrustFeature) IsEnabled(fl EnabledFeatures) bool {
	return fl.ChainOfTrust
}

func (cot *ChainOfTrustFeature) Killed(task *TaskRun) error {
	logFile := filepath.Join(TaskUser.HomeDir, "public", "logs", "live_backing.log")
	certifiedLogFile := filepath.Join(TaskUser.HomeDir, "public", "logs", "certified.log")
	signedCert := filepath.Join(TaskUser.HomeDir, "public", "logs", "chainOfTrust.json.asc")
	err := copyFileContents(logFile, certifiedLogFile)
	if err != nil {
		return err
	}
	err = task.uploadLog("public/logs/certified.log")
	if err != nil {
		return err
	}
	artifactHashes := map[string]ArtifactHash{}
	for _, artifact := range task.Artifacts {
		switch a := artifact.(type) {
		case S3Artifact:
			// make sure SHA256 is calculated
			hash, err := calculateHash(a)
			if err != nil {
				return err
			}
			artifactHashes[a.CanonicalPath] = ArtifactHash{
				SHA256: hash,
			}
		}
	}

	cotCert := &ChainOfTrustData{
		Version:     1,
		Artifacts:   artifactHashes,
		Task:        task.Definition,
		TaskID:      task.TaskID,
		RunID:       task.RunID,
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

	certBytes, err := json.MarshalIndent(cotCert, "", "  ")
	if err != nil {
		return err
	}
	// separate signature from json with a new line
	certBytes = append(certBytes, '\n')

	in := bytes.NewBuffer(certBytes)
	out, err := os.Create(signedCert)
	if err != nil {
		return err
	}
	defer out.Close()

	privKeyFile, err := os.Open(config.SigningKeyLocation)
	if err != nil {
		return err
	}
	defer privKeyFile.Close()
	entityList, err := openpgp.ReadArmoredKeyRing(privKeyFile)
	if err != nil {
		return err
	}
	privKey := entityList[0].PrivateKey
	w, err := clearsign.Encode(out, privKey, nil)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, in)
	if err != nil {
		return err
	}
	w.Close()
	out.Write([]byte{'\n'})
	out.Close()
	err = task.uploadLog("public/logs/chainOfTrust.json.asc")
	if err != nil {
		return err
	}
	return nil
}

func (cot *ChainOfTrustFeature) Created(task *TaskRun) error {
	return nil
}

func copyFileContents(src, dst string) (err error) {
	in, err := os.Open(src)
	if err != nil {
		return
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return
	}
	defer func() {
		cerr := out.Close()
		if err == nil {
			err = cerr
		}
	}()
	if _, err = io.Copy(out, in); err != nil {
		return
	}
	err = out.Sync()
	return
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
