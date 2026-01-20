package main

import (
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
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
		c.ResourceMonitor = process.MonitorResources(
			config.MinAvailableMemoryBytes,
			config.MaxMemoryUsagePercent,
			time.Duration(config.AllowedHighMemoryDurationSecs)*time.Second,
			config.DisableOOMProtection,
			r.task.Warnf,
			func() {
				err := r.task.StatusManager.Abort(
					&CommandExecutionError{
						Cause: fmt.Errorf(
							"task aborted due to sustained memory usage above %d%% and available memory less than %v",
							config.MaxMemoryUsagePercent,
							process.FormatMemoryString(config.MinAvailableMemoryBytes),
						),
						TaskStatus: failed,
					},
				)
				if err != nil {
					r.task.Warnf("Error when aborting task: %v", err)
				}
			},
		)
	}
	return nil
}

func (r *ResourceMonitorTask) Stop(err *ExecutionErrors) {
}
