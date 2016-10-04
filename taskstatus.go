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
			log.Printf("%v", err)
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

	abort := func(task *TaskRun, reason string) error {
		log.Printf("Aborting task %v due to: %v...", task.TaskID, reason)
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
				if update.IfStatusIn == nil || update.IfStatusIn[task.Status] {
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
						log.Printf("Internal error: unknown task status: %v", update.Status)
						os.Exit(64)
					}
				} else {
					// current status is such that we shouldn't update to new
					// status, so just report that no error occurred...
					log.Printf("Not able to update status to %v - current status %v, allowed current status for update: %v", update.Status, update.Task.Status, update.IfStatusIn)
					e <- nil
				}
			case <-d:
				close(d)
				break
			}
		}
	}()
	return r, e, d
}
