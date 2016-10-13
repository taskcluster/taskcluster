package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type taskStatusUpdate struct {
	Status     TaskStatus
	IfStatusIn map[TaskStatus]bool
	Reason     TaskUpdateReason
}

// Enumerate task status to aid life-cycle decision making
// Use strings for benefit of simple logging/reporting
const (
	aborted   TaskStatus = "Aborted"
	cancelled TaskStatus = "Cancelled"
	succeeded TaskStatus = "Succeeded"
	failed    TaskStatus = "Failed"
	errored   TaskStatus = "Errored"
	claimed   TaskStatus = "Claimed"
	reclaimed TaskStatus = "Reclaimed"
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
	request chan<- taskStatusUpdate
	err     <-chan error
	task    *TaskRun
}

func (tsm *TaskStatusManager) ReportException(reason TaskUpdateReason) error {
	tsm.request <- taskStatusUpdate{
		Status: errored,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
			aborted:   true,
		},
		Reason: reason,
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) ReportFailed() error {
	tsm.request <- taskStatusUpdate{
		Status: failed,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
			aborted:   true,
		},
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) ReportCompleted() error {
	tsm.request <- taskStatusUpdate{
		Status: succeeded,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
		},
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) Claim() error {
	tsm.request <- taskStatusUpdate{
		Status: claimed,
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) Reclaim() error {
	tsm.request <- taskStatusUpdate{
		Status: reclaimed,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
		},
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) Abort() error {
	tsm.request <- taskStatusUpdate{
		Status: aborted,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
		},
	}
	return <-tsm.err
}

func (tsm *TaskStatusManager) Cancel() error {
	tsm.request <- taskStatusUpdate{
		Status: cancelled,
		IfStatusIn: map[TaskStatus]bool{
			claimed:   true,
			reclaimed: true,
			aborted:   true,
		},
	}
	return <-tsm.err
}

func NewTaskStatusManager(task *TaskRun) *TaskStatusManager {

	r := make(chan taskStatusUpdate)
	e := make(chan error)

	// we'll make all these functions internal to TaskStatusHandler so that
	// they can only be called inside here, so that reading/writing to the
	// appropriate channels is the only way to trigger them, to ensure
	// proper concurrency handling

	reportException := func(task *TaskRun, reason TaskUpdateReason) error {
		ter := queue.TaskExceptionRequest{Reason: string(reason)}
		tsr, err := Queue.ReportException(task.TaskID, strconv.FormatInt(int64(task.RunID), 10), &ter)
		if err != nil {
			log.Printf("Not able to report exception for task %v:", task.TaskID)
			log.Printf("%v", err)
			return err
		}
		task.TaskClaimResponse.Status = tsr.Status
		log.Println(task.String())
		return nil
	}

	reportFailed := func(task *TaskRun) error {
		tsr, err := Queue.ReportFailed(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
		if err != nil {
			log.Printf("Not able to report failed completion for task %v:", task.TaskID)
			log.Printf("%v", err)
			return err
		}
		task.TaskClaimResponse.Status = tsr.Status
		log.Println(task.String())
		return nil
	}

	reportCompleted := func(task *TaskRun) error {
		log.Println("Command finished successfully!")
		tsr, err := Queue.ReportCompleted(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
		if err != nil {
			log.Printf("Not able to report successful completion for task %v:", task.TaskID)
			log.Printf("%v", err)
			return err
		}
		task.TaskClaimResponse.Status = tsr.Status
		// log.Println(task.String())
		return nil
	}

	claim := func(task *TaskRun) error {
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
			log.Println(task.String())
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
	}

	reclaim := func(task *TaskRun) error {
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
	}

	abort := func(task *TaskRun) error {
		log.Printf("Aborting task %v - max run time exceeded!", task.TaskID)
		task.Log("Aborting task - max run time exceeded!")
		// defer func() {
		// 	if r := recover(); r != nil {
		// 		log.Printf("Panic occured when killing process - ignoring!\n%v", r)
		// 	}
		// }()
		task.kill()
		return nil
	}

	cancel := func(task *TaskRun) error {
		//TODO: implement cancelling of tasks
		return nil
	}

	go func() {
		for update := range r {
			// only update if either IfStatusIn is nil
			// or it is non-nil but it has "true" value
			// for key of current status
			// note - task could have been aborted externally, so update.Task.Status
			// may not be correct in case of task canellation, but this race
			// condition will always exist, even if we add a check for the current
			// value, so then better to fail with a 409 RequestConflict
			if update.IfStatusIn == nil || update.IfStatusIn[task.Status] {
				task.Status = update.Status
				switch update.Status {
				// Aborting is when you stop running a job you already claimed
				case aborted:
					e <- abort(task)
				// Cancelling is when you decide not to run a job which you haven't yet claimed
				case cancelled:
					e <- cancel(task)
				case succeeded:
					e <- reportCompleted(task)
				case failed:
					e <- reportFailed(task)
				case errored:
					e <- reportException(task, update.Reason)
				case claimed:
					e <- claim(task)
				case reclaimed:
					e <- reclaim(task)
				default:
					log.Printf("Internal error: unknown task status: %v", update.Status)
					os.Exit(64)
				}
			} else {
				// current status is such that we shouldn't update to new
				// status, so report that state transition was not allowed
				e <- fmt.Errorf("Not able to update status from %v to %v. This is because you can only update to status %v if the previous status was one of: %v", task.Status, update.Status, update.Status, update.IfStatusIn)
			}
		}
	}()
	return &TaskStatusManager{
		request: r,
		err:     e,
		task:    task,
	}
}
