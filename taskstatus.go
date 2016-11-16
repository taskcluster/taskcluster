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
	unclaimed TaskStatus = "Unclaimed"
	claimed   TaskStatus = "Claimed"
	reclaimed TaskStatus = "Reclaimed"
	aborted   TaskStatus = "Aborted"
	cancelled TaskStatus = "Cancelled"
	succeeded TaskStatus = "Succeeded"
	failed    TaskStatus = "Failed"
	errored   TaskStatus = "Errored"
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

func (tsm *TaskStatusManager) ReportException(reason TaskUpdateReason) error {
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

func (tsm *TaskStatusManager) ReportFailed() error {
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

func (tsm *TaskStatusManager) ReportCompleted() error {
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

func (tsm *TaskStatusManager) Claim() error {
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

func (tsm *TaskStatusManager) Reclaim() error {
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
			// note we don't need to worry about a mutex here since either old
			// value or new value can be used for some crossover time, and the
			// update should be atomic
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

func (tsm *TaskStatusManager) Abort() error {
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

func (tsm *TaskStatusManager) Cancel() error {
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

func (tsm *TaskStatusManager) updateStatus(ts TaskStatus, f func(task *TaskRun) error, fromStatuses ...TaskStatus) error {
	tsm.Lock()
	defer tsm.Unlock()
	currentStatus := tsm.task.Status
	for _, allowedStatus := range fromStatuses {
		if currentStatus == allowedStatus {
			tsm.task.Status = ts
			return f(tsm.task)
		}
	}
	log.Printf("Not updating status of task %v run %v from %v to %v. This is because you can only update to status %v if the previous status was one of: %v", tsm.task.TaskID, tsm.task.RunID, tsm.task.Status, ts, ts, fromStatuses)
	return fmt.Errorf("Not updating status from %v to %v. This is because you can only update to status %v if the previous status was one of: %v", tsm.task.Status, ts, ts, fromStatuses)
}

func NewTaskStatusManager(task *TaskRun) *TaskStatusManager {
	return &TaskStatusManager{
		task: task,
	}
}
