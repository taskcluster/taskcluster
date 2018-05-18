package main

import (
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
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
	workerShutdown      TaskUpdateReason = "worker-shutdown"
	malformedPayload    TaskUpdateReason = "malformed-payload"
	resourceUnavailable TaskUpdateReason = "resource-unavailable"
	internalError       TaskUpdateReason = "internal-error"
	superseded          TaskUpdateReason = "superseded"
	intermittentTask    TaskUpdateReason = "intermittent-task"
)

type TaskStatusChangeListener struct {
	Name     string
	Callback func(ts TaskStatus)
}

type TaskStatusManager struct {
	sync.Mutex
	task       *TaskRun
	takenUntil tcclient.Time
	status     tcqueue.TaskStatusStructure
	// callback functions to call when status changes
	statusChangeListeners map[*TaskStatusChangeListener]bool
	abortException        *CommandExecutionError
	// closed when reclaim go routine should stop reclaiming
	stopReclaiming chan<- struct{}
	// closed when reclaim loop exits
	reclaimingDone <-chan struct{}
	// true if reclaims are no longer taking place for this task
	finishedReclaiming bool
}

func (tsm *TaskStatusManager) DeregisterListener(listener *TaskStatusChangeListener) {
	delete(tsm.statusChangeListeners, listener)
}

func (tsm *TaskStatusManager) RegisterListener(listener *TaskStatusChangeListener) {
	tsm.Lock()
	defer tsm.Unlock()
	tsm.statusChangeListeners[listener] = true
}

type TaskStatusUpdateError struct {
	Message       string
	CurrentStatus TaskStatus
}

func (ue *TaskStatusUpdateError) Error() string {
	return ue.Message + " (current status: " + string(ue.CurrentStatus) + ")"
}

func (tsm *TaskStatusManager) ReportException(reason TaskUpdateReason) error {
	return tsm.updateStatus(
		errored,
		func(task *TaskRun) error {
			tsm.stopReclaims()
			ter := tcqueue.TaskExceptionRequest{Reason: string(reason)}
			tsr, err := task.Queue.ReportException(task.TaskID, strconv.FormatInt(int64(task.RunID), 10), &ter)
			if err != nil {
				log.Printf("Not able to report exception for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			tsm.status = tsr.Status
			tsm.takenUntil = tcclient.Time{}
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
			tsm.stopReclaims()
			tsr, err := task.Queue.ReportFailed(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
			if err != nil {
				log.Printf("Not able to report failed completion for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			tsm.status = tsr.Status
			tsm.takenUntil = tcclient.Time{}
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
			tsm.stopReclaims()
			log.Printf("Task %v finished successfully!", task.TaskID)
			tsr, err := task.Queue.ReportCompleted(task.TaskID, strconv.FormatInt(int64(task.RunID), 10))
			if err != nil {
				log.Printf("Not able to report successful completion for task %v:", task.TaskID)
				log.Printf("%v", err)
				return err
			}
			tsm.status = tsr.Status
			tsm.takenUntil = tcclient.Time{}
			return nil
		},
		claimed,
		reclaimed,
	)
}

func (tsm *TaskStatusManager) reclaim() error {
	return tsm.updateStatus(
		reclaimed,
		func(task *TaskRun) error {
			log.Printf("Reclaiming task %v...", task.TaskID)
			tcrsp, err := task.Queue.ReclaimTask(task.TaskID, fmt.Sprintf("%d", task.RunID))

			// check if an error occurred...
			if err != nil {
				// probably task was cancelled - in any case, we should kill the running task...
				log.Printf("%v", err)
				task.kill()
				return err
			}

			task.TaskReclaimResponse = *tcrsp
			// Don't need a mutex here, since tsm.updateStatus is already mutex-protected
			task.Queue = tcqueue.New(&tcclient.Credentials{
				ClientID:    tcrsp.Credentials.ClientID,
				AccessToken: tcrsp.Credentials.AccessToken,
				Certificate: tcrsp.Credentials.Certificate,
			})
			tsm.status = tcrsp.Status
			tsm.takenUntil = tcrsp.TakenUntil
			if err != nil {
				log.Printf("SERIOUS BUG: invalid credentials in queue claim response body: %v", err)
			}
			log.Printf("Reclaimed task %v successfully.", task.TaskID)
			return nil
		},
		claimed,
		reclaimed,
	)
}

func (tsm *TaskStatusManager) AbortException() *CommandExecutionError {
	tsm.Lock()
	defer tsm.Unlock()
	return tsm.abortException
}

func (tsm *TaskStatusManager) TakenUntil() tcclient.Time {
	tsm.Lock()
	defer tsm.Unlock()
	return tsm.takenUntil
}

func (tsm *TaskStatusManager) Abort(cee *CommandExecutionError) error {
	return tsm.updateStatus(
		aborted,
		func(task *TaskRun) error {
			task.Errorf("Aborting task...")
			task.kill()
			tsm.abortException = cee
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
	// no scopes required for this endpoint, so can use global Queue object
	// this is also useful if tsm.task.Queue == nil (which can happen if claim
	// failed because task is claimed by another worker)
	tsr, err := queue.Status(tsm.task.TaskID)
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

func (tsm *TaskStatusManager) updateStatus(ts TaskStatus, f func(task *TaskRun) error, fromStatuses ...TaskStatus) error {
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
			for listener := range tsm.statusChangeListeners {
				log.Printf("Notifying listener %v of state change", listener.Name)
				listener.Callback(ts)
			}
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

	stopReclaiming := make(chan struct{})
	reclaimingDone := make(chan struct{})

	tsm := &TaskStatusManager{
		task:                  task,
		takenUntil:            task.TaskClaimResponse.TakenUntil,
		status:                task.TaskClaimResponse.Status,
		statusChangeListeners: map[*TaskStatusChangeListener]bool{},
		stopReclaiming:        stopReclaiming,
		reclaimingDone:        reclaimingDone,
	}

	// Reclaiming Tasks
	// ----------------
	// When the worker has claimed a task, it's said to have a claim to a given
	// `taskId`/`runId`. This claim has an expiration, see the `takenUntil`
	// property in the _task status structure_ returned from `tcqueue.ClaimTask`
	// and `tcqueue.ReclaimTask`. A worker must call `tcqueue.ReclaimTask` before
	// the claim denoted in `takenUntil` expires. It's recommended that this
	// attempted a few minutes prior to expiration, to allow for clock drift.

	go func() {
		defer close(reclaimingDone)
		for {
			var waitTimeUntilReclaim time.Duration
			if reclaimEvery5Seconds {
				// Reclaim in 5 seconds...
				waitTimeUntilReclaim = time.Second * 5
			} else {
				// Reclaim 3 mins before current claim expires...
				takenUntil := time.Time(tsm.TakenUntil())
				reclaimTime := takenUntil.Add(time.Minute * -3)
				// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
				waitTimeUntilReclaim = reclaimTime.Round(0).Sub(time.Now())
				log.Printf("Reclaiming task %v at %v", task.TaskID, reclaimTime)
				log.Printf("Current task claim expires at %v", takenUntil)
				// sanity check - only set an alarm, if wait time >= 30s, so we can't hammer queue in production
				if waitTimeUntilReclaim.Seconds() < 30 {
					log.Printf("WARNING: This is less than 30 seconds away. NOT setting a reclaim timer for task %v to avoid hammering queue if this is a bug.", task.TaskID)
					return
				}
			}
			log.Printf("Reclaiming task %v in %v", task.TaskID, waitTimeUntilReclaim)
			select {
			case <-stopReclaiming:
				return
			case <-time.After(waitTimeUntilReclaim):
				log.Printf("About to reclaim task %v...", task.TaskID)
				err := tsm.reclaim()
				if err != nil {
					log.Printf("ERROR: Encountered exception when reclaiming task %v - giving up retrying: %v", task.TaskID, err)
					return
				}
				log.Printf("Successfully reclaimed task %v", task.TaskID)
			}
		}
	}()
	return tsm
}

// stopReclaims() must be called when tsm.Lock() is held by caller
func (tsm *TaskStatusManager) stopReclaims() {
	if !tsm.finishedReclaiming {
		close(tsm.stopReclaiming)
		<-tsm.reclaimingDone
		tsm.finishedReclaiming = true
	}
}
