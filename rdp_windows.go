package main

import (
	"net"
	"path/filepath"
	"time"

	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

var (
	rdpInfoPath = filepath.Join("generic-worker", "rdp.json")
)

type RDPFeature struct {
}

func (feature *RDPFeature) Name() string {
	return "RDP"
}

func (feature *RDPFeature) Initialise() error {
	return nil
}

func (feature *RDPFeature) PersistState() error {
	return nil
}

// RDP is only enabled when task.payload.rdpInfo is set
func (feature *RDPFeature) IsEnabled(task *TaskRun) bool {
	return task.Payload.RdpInfo != ""
}

type RDPTask struct {
	task *TaskRun
	info *RDPInfo
}

type RDPInfo struct {
	Host     net.IP `json:"host"`
	Port     uint16 `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (feature *RDPFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &RDPTask{
		task: task,
	}
}

func (l *RDPTask) RequiredScopes() scopes.Required {
	return scopes.Required{
		{
			"generic-worker:allow-rdp:" + l.task.Definition.ProvisionerID + "/" + l.task.Definition.WorkerType,
		},
	}
}

func (l *RDPTask) ReservedArtifacts() []string {
	return []string{
		l.task.Payload.RdpInfo,
	}
}

func (l *RDPTask) Start() *CommandExecutionError {
	l.createRDPArtifact()
	return l.uploadRDPArtifact()
}

func (l *RDPTask) Stop(err *ExecutionErrors) {
	time.Sleep(time.Hour * 12)
}

func (l *RDPTask) createRDPArtifact() {
	l.info = &RDPInfo{
		Host:     config.PublicIP,
		Port:     3389,
		Username: taskContext.User.Name,
		Password: taskContext.User.Password,
	}
	rdpInfoFile := filepath.Join(taskContext.TaskDir, rdpInfoPath)
	err := fileutil.WriteToFileAsJSON(l.info, rdpInfoFile)
	// if we can't write this, something seriously wrong, so cause worker to
	// report an internal-error to sentry and crash!
	if err != nil {
		panic(err)
	}
}

func (l *RDPTask) uploadRDPArtifact() *CommandExecutionError {
	return l.task.uploadArtifact(
		&S3Artifact{
			BaseArtifact: &BaseArtifact{
				Name: l.task.Payload.RdpInfo,
				// RDP info expires one day after task
				Expires: tcclient.Time(time.Now().Add(time.Hour * 24)),
			},
			ContentType:     "application/json",
			ContentEncoding: "gzip",
			Path:            rdpInfoPath,
		},
	)
}
