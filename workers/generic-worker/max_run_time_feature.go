package main

import (
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster/v96/internal/scopes"
)

type (
	MaxRunTimeFeature struct {
	}

	MaxRunTimeTaskFeature struct {
		task  *TaskRun
		timer *time.Timer
	}
)

func (mrtf *MaxRunTimeFeature) Name() string {
	return "Max Run Time"
}

func (mrtf *MaxRunTimeFeature) Initialise() (err error) {
	return nil
}

func (mrtf *MaxRunTimeFeature) IsEnabled() bool {
	return true
}

func (mrtf *MaxRunTimeFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (mrtf *MaxRunTimeFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &MaxRunTimeTaskFeature{
		task: task,
	}
}

func (mrttf *MaxRunTimeTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (mrttf *MaxRunTimeTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (mrttf *MaxRunTimeTaskFeature) Start() *CommandExecutionError {
	if mrttf.task.Payload.MaxRunTime > int64(config.MaxTaskRunTime) {
		return MalformedPayloadError(fmt.Errorf("task's maxRunTime of %d exceeded allowed maximum of %d", mrttf.task.Payload.MaxRunTime, config.MaxTaskRunTime))
	}
	mrttf.timer = time.AfterFunc(
		time.Second*time.Duration(mrttf.task.Payload.MaxRunTime),
		func() {
			// ignore any error the Abort function returns - we are in the
			// wrong go routine to properly handle it
			err := mrttf.task.StatusManager.Abort(Failure(fmt.Errorf("task aborted - max run time exceeded")))
			if err != nil {
				mrttf.task.Warnf("Error when aborting task: %v", err)
			}
		},
	)
	return nil
}

func (mrttf *MaxRunTimeTaskFeature) Stop(err *ExecutionErrors) {
	// Bug 1329617
	// ********* DON'T drain channel **********
	// because AfterFunc() drains it!
	// see https://play.golang.org/p/6pqRerGVcg
	// ****************************************
	//
	// if !t.Stop() {
	// <-t.C
	// }
	// Also check for nil, in case Start() failed due to invalid maxRunTime value
	if mrttf.timer != nil {
		mrttf.timer.Stop()
	}
}
