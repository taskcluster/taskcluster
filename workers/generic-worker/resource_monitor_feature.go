package main

import (
	"errors"

	"github.com/taskcluster/taskcluster/v84/internal/scopes"
	"github.com/taskcluster/taskcluster/v84/workers/generic-worker/process"
)

type ResourceMonitorFeature struct {
}

func (feature *ResourceMonitorFeature) Name() string {
	return "Resource Monitor"
}

func (feature *ResourceMonitorFeature) Initialise() error {
	return nil
}

func (feature *ResourceMonitorFeature) IsEnabled() bool {
	return config.EnableResourceMonitor
}

func (feature *ResourceMonitorFeature) IsRequested(task *TaskRun) bool {
	return task.Payload.Features.ResourceMonitor
}

type ResourceMonitorTask struct {
	task *TaskRun
}

func (feature *ResourceMonitorFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &ResourceMonitorTask{
		task: task,
	}
}

func (r *ResourceMonitorTask) ReservedArtifacts() []string {
	return []string{}
}

func (r *ResourceMonitorTask) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (r *ResourceMonitorTask) Start() *CommandExecutionError {
	for _, c := range r.task.Commands {
		c.ResourceMonitor = process.MonitorResources(func(previouslyWarned bool) bool {
			if config.DisableOOMProtection {
				if !previouslyWarned {
					r.task.Warn("Sustained memory usage above 90%!")
					r.task.Warn("OOM protections are disabled, continuing task...")
				}
				return false
			} else {
				r.task.Warn("Sustained memory usage above 90%!")
				r.task.Warn("Aborting task to prevent OOM issues...")
			}
			err := r.task.StatusManager.Abort(
				&CommandExecutionError{
					Cause:      errors.New("task aborted due to sustained memory usage above 90%"),
					TaskStatus: failed,
				},
			)
			if err != nil {
				r.task.Warnf("Error when aborting task: %v", err)
			}
			return true
		})
	}
	return nil
}

func (r *ResourceMonitorTask) Stop(err *ExecutionErrors) {
}
