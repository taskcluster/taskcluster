//go:build darwin || linux || freebsd

package main

import (
	"github.com/taskcluster/taskcluster/v73/internal/scopes"
)

type KVMFeature struct {
}

func (feature *KVMFeature) Name() string {
	return "KVM"
}

func (feature *KVMFeature) Initialise() error {
	return nil
}

func (feature *KVMFeature) PersistState() error {
	return nil
}

func (feature *KVMFeature) IsEnabled(task *TaskRun) bool {
	return config.EnableD2G && task.Payload.Features.KVM
}

func (feature *KVMFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &KVMTask{
		task: task,
	}
}

type KVMTask struct {
	task *TaskRun
}

func (kvmt *KVMTask) RequiredScopes() scopes.Required {
	// these scopes come from the d2g.Scopes() translation
	// of the Docker Worker scope needed for KVM usage below:
	//
	// docker-worker:capability:device:kvm:<workerPoolName>
	// OR
	// docker-worker:capability:device:kvm
	return scopes.Required{
		{"generic-worker:capability:device:kvm:" + config.ProvisionerID + "/" + config.WorkerType},
		{"generic-worker:capability:device:kvm"},
	}
}

func (kvmt *KVMTask) ReservedArtifacts() []string {
	return []string{}
}

func (kvmt *KVMTask) Start() *CommandExecutionError {
	return kvmt.ensurePlatform()
}

func (kvmt *KVMTask) Stop(err *ExecutionErrors) {
}
