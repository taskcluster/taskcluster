package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v107/clients/client-go"
	"github.com/taskcluster/taskcluster/v107/internal/scopes"
	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/safefs"
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

func (feature *RDPFeature) IsEnabled() bool {
	return config.EnableRDP
}

// RDP is only enabled when task.payload.rdpInfo is set
func (feature *RDPFeature) IsRequested(task *TaskRun) bool {
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
	if err := l.createRDPArtifact(); err != nil {
		return err
	}
	return l.uploadRDPArtifact()
}

func (l *RDPTask) Stop(err *ExecutionErrors) {
	time.Sleep(time.Hour * 12)
}

func (l *RDPTask) createRDPArtifact() *CommandExecutionError {
	ctx := l.task.GetContext()
	l.info = &RDPInfo{
		Host:     config.PublicIP,
		Port:     3389,
		Username: ctx.User.Name,
		Password: ctx.User.Password,
	}
	jsonBytes, err := json.MarshalIndent(l.info, "", "  ")
	if err != nil {
		panic(err)
	}
	rdpInfoFile := fileutil.AbsFrom(ctx.TaskDir, rdpInfoPath)
	if err := safefs.WriteFile(rdpInfoFile, append(jsonBytes, '\n'), 0644); err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not write rdp info to %v: %w", rdpInfoFile, err))
	}
	return nil
}

func (l *RDPTask) uploadRDPArtifact() *CommandExecutionError {
	taskDir := l.task.TaskDir()
	rdpInfoFile := fileutil.AbsFrom(taskDir, rdpInfoPath)
	contentPath, err := safeReservedCopy(rdpInfoFile)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not read reserved artifact %v: %w", rdpInfoFile, err))
	}
	defer os.Remove(contentPath)
	return l.task.uploadArtifact(
		createDataArtifact(
			&artifacts.BaseArtifact{
				Name: l.task.Payload.RdpInfo,
				// RDP info expires one day after task
				Expires: tcclient.Time(time.Now().Add(time.Hour * 24)),
			},
			rdpInfoFile,
			contentPath,
			"application/json",
			"gzip",
		),
	)
}
