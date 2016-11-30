package main

import (
	"fmt"
	"log"
	"strconv"
	"sync"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

// Enumerate task status to aid life-cycle decision making
// Use strings for benefit of simple logging/reporting
const (
	unclaimed        TaskStatus = "Unclaimed"
	claimed          TaskStatus = "Claimed"
	reclaimed        TaskStatus = "Reclaimed"
	aborted          TaskStatus = "Aborted"
	cancelled        TaskStatus = "Cancelled"
	succeeded        TaskStatus = "Succeeded"
	failed           TaskStatus = "Failed"
	errored          TaskStatus = "Errored"
	unknown          TaskStatus = "Unknown"
	deadlineExceeded TaskStatus = "Deadline Exceeded"
)

const (
	WorkerShutdown      TaskUpdateReason = "worker-shutdown"
	MalformedPayload    TaskUpdateReason = "malformed-payload"
	ReousrceUnavailable TaskUpdateReason = "resource-unavailable"
	InternalError       TaskUpdateReason = "internal-error"
	Superseded          TaskUpdateReason = "superseded"
	IntermittentTask    TaskUpdateReason = "intermittent-task"
)

type TaskStatusManager struct {
	sync.Mutex
	task *TaskRun
}

type TaskStatusUpdateError struct {
	Message       string
	CurrentStatus TaskStatus
}

func (ue *TaskStatusUpdateError) Error() string {
	return ue.Message + " (current status: " + string(ue.CurrentStatus) + ")"
}

func (tsm *TaskStatusManager) ReportException(reason TaskUpdateReason) *TaskStatusUpdateError {
	return tsm.updateStatus(
		errored,
		func(task *TaskRun) error {
			ter := queue.TaskExceptionRequest{Reason: string(reason)}
			tsr, err := Queue.ReportException(task.TaskID, strconv.FormatInt(int64(task.RunID), 10), &ter)
			if err != nil {
				log.Printf("Not able to report exception for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			task.TaskClaimResponse.Status = tsr.Status
			log.Print(task.String())
			return nil
		},
		claimed,
		reclaimed,
		aborted,
	)
}

func (tsm *TaskStatusManager) ReportFailed() *TaskStatusUpdateError {
	return tsm.updateStatus(
		failed,
		func(task *TaskRun) error {
			tsr, err := Queue.ReportFailed(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
			if err != nil {
				log.Printf("Not able to report failed completion for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			task.TaskClaimResponse.Status = tsr.Status
			log.Print(task.String())
			return nil
		},
		claimed,
		reclaimed,
		aborted,
	)
}

func (tsm *TaskStatusManager) ReportCompleted() *TaskStatusUpdateError {
	return tsm.updateStatus(
		succeeded,
		func(task *TaskRun) error {
			log.Print("Command finished successfully!")
			tsr, err := Queue.ReportCompleted(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
			if err != nil {
				log.Printf("Not able to report successful completion for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			task.TaskClaimResponse.Status = tsr.Status
			// log.Print(task.String())
			return nil
		},
		claimed,
		reclaimed,
	)
}

func (tsm *TaskStatusManager) Claim() *TaskStatusUpdateError {
	return tsm.updateStatus(
		claimed,
		func(task *TaskRun) error {
			log.Printf("Claiming task %v...", task.TaskID)
			task.TaskClaimRequest = queue.TaskClaimRequest{
				WorkerGroup: config.WorkerGroup,
				WorkerID:    config.WorkerID,
			}
			// Using the taskId and runId from the <MessageText> tag, the worker
			// must call queue.claimTask().
			tcrsp, err := Queue.ClaimTask(task.TaskID, fmt.Sprintf("%d", task.RunID), &task.TaskClaimRequest)
			// check if an error occurred...
			if err != nil {
				// If the queue.claimTask() operation fails with a 4xx error, the
				// worker must delete the messages from the Azure queue (except 401).
				switch err := err.(type) {
				case httpbackoff.BadHttpResponseCode:
					switch {
					case err.HttpResponseCode == 401:
						log.Printf("Whoops - not authorized to claim task %v, *not* deleting it from Azure queue!", task.TaskID)
					case err.HttpResponseCode/100 == 4:
						// attempt to delete, but if it fails, log and continue
						// nothing we can do, and better to return the first 4xx error
						errDelete := task.deleteFromAzure()
						if errDelete != nil {
							log.Printf("Not able to delete task %v from Azure after receiving http status code %v when claiming it.", task.TaskID, err.HttpResponseCode)
							log.Printf("%v", errDelete)
						}
					}
				}
				log.Print(task.String())
				log.Printf("%v", err)
				return err
			}
			task.TaskClaimResponse = *tcrsp
			// note we don't need to worry about a mutex here since either old
			// value or new value can be used for some crossover time, and the
			// update should be atomic
			task.Queue = queue.New(&tcclient.Credentials{
				ClientID:    tcrsp.Credentials.ClientID,
				AccessToken: tcrsp.Credentials.AccessToken,
				Certificate: tcrsp.Credentials.Certificate,
			})

			// don't report failure if this fails, as it is already logged and failure =>
			task.deleteFromAzure()
			return nil
		},
		unclaimed,
	)
}

func (tsm *TaskStatusManager) Reclaim() *TaskStatusUpdateError {
	return tsm.updateStatus(
		reclaimed,
		func(task *TaskRun) error {
			log.Printf("Reclaiming task %v...", task.TaskID)
			tcrsp, err := Queue.ReclaimTask(task.TaskID, fmt.Sprintf("%d", task.RunID))

			// check if an error occurred...
			if err != nil {
				// probably task was cancelled - in any case, we should kill the running task...
				log.Printf("%v", err)
				task.kill()
				return err
			}

			task.TaskReclaimResponse = *tcrsp
			// TODO: probably should use a mutex here
			task.Queue = queue.New(&tcclient.Credentials{
				ClientID:    tcrsp.Credentials.ClientID,
				AccessToken: tcrsp.Credentials.AccessToken,
				Certificate: tcrsp.Credentials.Certificate,
			})
			log.Printf("Reclaimed task %v successfully.", task.TaskID)
			return nil
		},
		claimed,
		reclaimed,
	)
}

func (tsm *TaskStatusManager) Abort() *TaskStatusUpdateError {
	return tsm.updateStatus(
		aborted,
		func(task *TaskRun) error {
			log.Printf("Aborting task %v - max run time exceeded!", task.TaskID)
			task.Log("Aborting task - max run time exceeded!")
			// defer func() {
			// 	if r := recover(); r != nil {
			// 		log.Printf("Panic occured when killing process - ignoring!\n%v", r)
			// 	}
			// }()
			task.kill()
			return nil
		},
		claimed,
		reclaimed,
	)
}

func (tsm *TaskStatusManager) Cancel() *TaskStatusUpdateError {
	return tsm.updateStatus(
		cancelled,
		func(task *TaskRun) error {
			//TODO: implement cancelling of tasks
			return nil
		},
		claimed,
		reclaimed,
		aborted,
	)
}

func (tsm *TaskStatusManager) LastKnownStatus() TaskStatus {
	tsm.Lock()
	defer tsm.Unlock()
	return tsm.task.Status
}

// Queries the queue to get the latest status. Note, it can't recognise
// internal states claimed/reclaimed/aborted but is useful for setting
// failed/cancelled/pending/completed/exception.
func (tsm *TaskStatusManager) UpdateStatus() {
	tsm.Lock()
	defer tsm.Unlock()
	tsm.queryQueueForLatestStatus()
}

func (tsm *TaskStatusManager) queryQueueForLatestStatus() {
	log.Printf("Querying queue to get latest status for task %v...", tsm.task.TaskID)
	tsr, err := tsm.task.Queue.Status(tsm.task.TaskID)
	if err != nil {
		tsm.task.Status = unknown
		return
	}

	taskStatus := tsr.Status.Runs[tsm.task.RunID]
	switch {
	case taskStatus.ReasonResolved == "failed":
		tsm.task.Status = failed
	case taskStatus.ReasonResolved == "canceled":
		tsm.task.Status = cancelled
	case taskStatus.ReasonResolved == "deadline-exceeded":
		tsm.task.Status = deadlineExceeded
	case taskStatus.State == "pending":
		tsm.task.Status = unclaimed
	case taskStatus.State == "completed":
		tsm.task.Status = succeeded
	case taskStatus.State == "exception":
		tsm.task.Status = errored
	}
	log.Printf("Latest status: %v", tsm.task.Status)
}

func (tsm *TaskStatusManager) updateStatus(ts TaskStatus, f func(task *TaskRun) error, fromStatuses ...TaskStatus) *TaskStatusUpdateError {
	tsm.Lock()
	defer tsm.Unlock()
	currentStatus := tsm.task.Status
	for _, allowedStatus := range fromStatuses {
		if currentStatus == allowedStatus {
			e := f(tsm.task)
			if e != nil {
				tsm.queryQueueForLatestStatus()
				return &TaskStatusUpdateError{
					Message:       e.Error(),
					CurrentStatus: tsm.task.Status,
				}
			}
			tsm.task.Status = ts
			return nil
		}
	}
	warning := fmt.Sprintf("Not updating status of task %v run %v from %v to %v. This is because you can only update to status %v if the previous status was one of: %v", tsm.task.TaskID, tsm.task.RunID, tsm.task.Status, ts, ts, fromStatuses)
	log.Print(warning)
	return &TaskStatusUpdateError{
		Message:       warning,
		CurrentStatus: tsm.task.Status,
	}
}

func NewTaskStatusManager(task *TaskRun) *TaskStatusManager {
	return &TaskStatusManager{
		task: task,
	}
}
