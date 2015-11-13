package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

type TaskStatusUpdate struct {
	Task       *TaskRun
	Status     TaskStatus
	IfStatusIn map[TaskStatus]bool
	Reason     string
}

// Enumerate task status to aid life-cycle decision making
// Use strings for benefit of simple logging/reporting
const (
	Aborted   TaskStatus = "Aborted"
	Cancelled TaskStatus = "Cancelled"
	Succeeded TaskStatus = "Succeeded"
	Failed    TaskStatus = "Failed"
	Errored   TaskStatus = "Errored"
	Claimed   TaskStatus = "Claimed"
	Reclaimed TaskStatus = "Reclaimed"
)

// TaskStatusHandler is the single point of contact
// between go routines for handling updates to the
// status of a task. When called, it will spawn a
// go routine to manage task status updates (both
// internally tracking TaskRun.Status and also
// informing the Queue about the status). Errors
// from talking to the Queue are returned on err
// channel.
func TaskStatusHandler() (request chan<- TaskStatusUpdate, err <-chan error, done chan<- bool) {
	r := make(chan TaskStatusUpdate)
	e := make(chan error)
	d := make(chan bool)

	// we'll make all these functions internal to TaskStatusHandler so that
	// they can only be called inside here, so that reading/writing to the
	// appropriate channels is the only way to trigger them, to ensure
	// proper concurrency handling

	reportException := func(task *TaskRun, reason string) error {
		ter := queue.TaskExceptionRequest{Reason: reason}
		tsr, callSummary := Queue.ReportException(task.TaskId, strconv.FormatInt(int64(task.RunId), 10), &ter)
		if callSummary.Error != nil {
			debug("Not able to report exception for task %v:", task.TaskId)
			debug("%v", callSummary.Error)
			return callSummary.Error
		}
		task.TaskClaimResponse.Status = tsr.Status
		debug(task.String())
		return nil
	}

	reportFailed := func(task *TaskRun) error {
		tsr, callSummary := Queue.ReportFailed(task.TaskId, strconv.FormatInt(int64(task.RunId), 10))
		if callSummary.Error != nil {
			debug("Not able to report failed completion for task %v:", task.TaskId)
			debug("%v", callSummary.Error)
			return callSummary.Error
		}
		task.TaskClaimResponse.Status = tsr.Status
		debug(task.String())
		return nil
	}

	reportCompleted := func(task *TaskRun) error {
		debug("Command finished successfully!")
		tsr, callSummary := Queue.ReportCompleted(task.TaskId, strconv.FormatInt(int64(task.RunId), 10))
		if callSummary.Error != nil {
			debug("Not able to report successful completion for task %v:", task.TaskId)
			debug("%v", callSummary.Error)
			return callSummary.Error
		}
		task.TaskClaimResponse.Status = tsr.Status
		debug(task.String())
		return nil
	}

	claim := func(task *TaskRun) error {
		debug("Claiming task %v...", task.TaskId)
		task.TaskClaimRequest = queue.TaskClaimRequest{
			WorkerGroup: config.WorkerGroup,
			WorkerId:    config.WorkerId,
		}
		// Using the taskId and runId from the <MessageText> tag, the worker
		// must call queue.claimTask().
		tcrsp, callSummary := Queue.ClaimTask(task.TaskId, fmt.Sprintf("%d", task.RunId), &task.TaskClaimRequest)
		task.ClaimCallSummary = *callSummary
		// check if an error occurred...
		if callSummary.Error != nil {
			// If the queue.claimTask() operation fails with a 4xx error, the
			// worker must delete the messages from the Azure queue (except 401).
			switch {
			case callSummary.HttpResponse.StatusCode == 401:
				debug("Whoops - not authorized to claim task %v, *not* deleting it from Azure queue!", task.TaskId)
			case callSummary.HttpResponse.StatusCode/100 == 4:
				// attempt to delete, but if it fails, log and continue
				// nothing we can do, and better to return the first 4xx error
				err := task.deleteFromAzure()
				if err != nil {
					debug("Not able to delete task %v from Azure after receiving http status code %v when claiming it.", task.TaskId, callSummary.HttpResponse.StatusCode)
					debug("%v", err)
				}
			}
			debug(task.String())
			debug("%v", callSummary.Error)
			return callSummary.Error
		}
		task.TaskClaimResponse = *tcrsp
		// don't report failure if this fails, as it is already logged and failure =>
		task.deleteFromAzure()
		return nil
	}

	reclaim := func(task *TaskRun) error {
		debug("Reclaiming task %v...", task.TaskId)
		tcrsp, callSummary := Queue.ReclaimTask(task.TaskId, fmt.Sprintf("%d", task.RunId))
		task.ClaimCallSummary = *callSummary

		// check if an error occurred...
		if err := callSummary.Error; err != nil {
			debug("%v", err)
			return err
		}

		task.TaskReclaimResponse = *tcrsp
		debug("Reclaimed task %v successfully (http response code %v).", task.TaskId, callSummary.HttpResponse.StatusCode)
		return nil
	}

	abort := func(task *TaskRun, reason string) error {
		debug("Aborting task %v due to: %v...", task.TaskId, reason)
		task.Status = Aborted
		// TODO: need to kill running jobs! Need a go routine to track running
		// jobs, and kill them on aborts
		return reportException(task, "task-cancelled")
	}

	cancel := func(task *TaskRun, reason string) error {
		//TODO: implement cancelling of tasks
		return nil
	}

	go func() {
		for {
			select {
			case update := <-r:
				// only update if either IfStatusIn is nil
				// or it is non-nil but it has "true" value
				// for key of current status
				if update.IfStatusIn == nil || update.IfStatusIn[update.Status] {
					task := update.Task
					task.Status = update.Status
					switch update.Status {
					// Aborting is when you stop running a job you already claimed
					case Aborted:
						e <- abort(task, update.Reason)
					// Cancelling is when you decide not to run a job which you haven't yet claimed
					case Cancelled:
						e <- cancel(task, update.Reason)
					case Succeeded:
						e <- reportCompleted(task)
					case Failed:
						e <- reportFailed(task)
					case Errored:
						e <- reportException(task, update.Reason)
					case Claimed:
						e <- claim(task)
					case Reclaimed:
						e <- reclaim(task)
					default:
						debug("Internal error: unknown task status: %v", update.Status)
						os.Exit(64)
					}
				} else {
					// current status is such that we shouldn't update to new
					// status, so just report that no error occurred...
					e <- nil
				}
			case <-d:
				break
			}
		}
	}()
	return r, e, d
}
