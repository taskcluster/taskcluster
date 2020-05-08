package main

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"time"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v29/clients/client-go"
	"github.com/taskcluster/taskcluster/v29/internal/scopes"
	"github.com/taskcluster/taskcluster/v29/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v29/workers/generic-worker/livelog"
	"github.com/taskcluster/taskcluster/v29/workers/generic-worker/process"
)

var (
	livelogName = "public/logs/live.log"

	// The port on which the livelog process listens.  This is then proxied
	// to the user by the exposer.  This port must be different from liveLogGETPort
	// and liveLogPUTPort.
	internalGETPort uint16 = 60099
)

type LiveLogFeature struct {
}

func (feature *LiveLogFeature) Name() string {
	return "Live Log"
}

func (feature *LiveLogFeature) Initialise() error {
	return nil
}

func (feature *LiveLogFeature) PersistState() error {
	return nil
}

// livelog is always enabled
func (feature *LiveLogFeature) IsEnabled(task *TaskRun) bool {
	return true
}

type LiveLogTask struct {
	liveLog        *livelog.LiveLog
	exposure       expose.Exposure
	task           *TaskRun
	backingLogFile *os.File
}

func (l *LiveLogTask) ReservedArtifacts() []string {
	return []string{
		livelogName,
	}
}

func (feature *LiveLogFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &LiveLogTask{
		task: task,
	}
}

func (l *LiveLogTask) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (l *LiveLogTask) Start() *CommandExecutionError {
	liveLog, err := livelog.New(config.LiveLogExecutable, config.LiveLogPUTPort, internalGETPort)
	if err != nil {
		log.Printf("WARNING: could not create livelog: %s", err)
		// then run without livelog, is only a "best effort" service
		return nil
	}
	l.liveLog = liveLog
	updateErr := l.updateTaskLogWriter(liveLog.LogWriter)
	if updateErr != nil {
		return updateErr
	}

	err = l.uploadLiveLogArtifact()
	if err != nil {
		log.Printf("WARNING: could not upload livelog artifact: %s", err)
	}
	return nil
}

func (l *LiveLogTask) updateTaskLogWriter(liveLogWriter io.Writer) *CommandExecutionError {
	l.task.logMux.Lock()
	defer l.task.logMux.Unlock()
	// store current writer so it can be reinstated later when stopping livelog
	l.backingLogFile = l.task.logWriter.(*os.File)
	// write logs written so far to livelog
	// first rewind to beginning of backing log...
	_, err := l.backingLogFile.Seek(0, 0)
	if err != nil {
		log.Printf("Could not seek to start of backing log file: %s", err)
		// then run without livelog, is only a "best effort" service
		return nil
	}
	// now copy from backing log into livelog
	_, err = io.Copy(liveLogWriter, l.backingLogFile)
	if err != nil {
		log.Printf("Could not copy from backing log to livelog: %s", err)
		// then run without livelog, is only a "best effort" service
		return nil
	}
	// from now on, all output should go to both the backing log and the livelog...
	l.task.logWriter = io.MultiWriter(liveLogWriter, l.backingLogFile)

	// make sure task also logs to the new multiwriter
	setCommandLogWriters(l.task.Commands, l.task.logWriter)
	return nil
}

func (l *LiveLogTask) Stop(err *ExecutionErrors) {
	// if livelog couldn't be started, nothing to do here...
	if l.liveLog == nil {
		return
	}
	l.reinstateBackingLog()
	errClose := l.liveLog.LogWriter.Close()
	if errClose != nil {
		// no need to raise an exception
		log.Printf("WARNING: could not close livelog writer: %s", errClose)
	}
	errTerminate := l.liveLog.Terminate()
	if errTerminate != nil {
		// no need to raise an exception
		log.Printf("WARNING: could not terminate livelog writer: %s", errTerminate)
	}
	log.Printf("Redirecting %v to %v", livelogName, logName)
	logURL := tcurls.API(queue.RootURL, "queue", "v1", fmt.Sprintf("task/%v/runs/%v/artifacts/%v", l.task.TaskID, l.task.RunID, logName))
	err.add(l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name: livelogName,
				// same expiry as underlying log it points to
				Expires: l.task.Definition.Expires,
			},
			ContentType: "text/plain; charset=utf-8",
			URL:         logURL,
		},
	))

	if l.exposure != nil {
		closeErr := l.exposure.Close()
		l.exposure = nil
		if closeErr != nil {
			log.Printf("WARNING: could not terminate livelog exposure: %s", closeErr)
		}
	}
}

func (l *LiveLogTask) reinstateBackingLog() {
	l.task.logMux.Lock()
	defer l.task.logMux.Unlock()
	if l.backingLogFile != nil {
		l.task.logWriter = l.backingLogFile
	}
}

func (l *LiveLogTask) uploadLiveLogArtifact() error {
	var err error
	l.exposure, err = exposer.ExposeHTTP(internalGETPort)
	if err != nil {
		return err
	}

	// combine the path from the livelog URL with the expose URL
	logURL, err := url.Parse(l.liveLog.GetURL)
	if err != nil {
		return err
	}
	exposeURL := l.exposure.GetURL()
	if exposeURL.Path == "/" {
		exposeURL.Path = logURL.Path
	} else {
		exposeURL.Path = exposeURL.Path + logURL.Path
	}

	// add an extra 15 minutes, to adequately cover client/server clock drift or task initialisation delays
	expires := time.Now().Add(time.Duration(l.task.Payload.MaxRunTime+900) * time.Second)
	uploadErr := l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name:    livelogName,
				Expires: tcclient.Time(expires),
			},
			ContentType: "text/plain; charset=utf-8",
			URL:         exposeURL.String(),
		},
	)
	if uploadErr != nil {
		return uploadErr
	}
	// note this will be error(nil) not *CommandExecutionError(nil)
	return nil
}

func setCommandLogWriters(commands []*process.Command, logWriter io.Writer) {
	for i := range commands {
		commands[i].DirectOutput(logWriter)
	}
}
