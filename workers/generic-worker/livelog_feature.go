package main

import (
	"io"
	"log"
	"net/url"
	"os"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
	"github.com/taskcluster/taskcluster/v92/internal/scopes"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/livelog"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/process"
)

type LiveLogFeature struct {
}

func (feature *LiveLogFeature) Name() string {
	return "Live Log"
}

func (feature *LiveLogFeature) Initialise() error {
	return nil
}

func (feature *LiveLogFeature) IsEnabled() bool {
	return config.EnableLiveLog
}

func (feature *LiveLogFeature) IsRequested(task *TaskRun) bool {
	return task.Payload.Features.LiveLog
}

type LiveLogTask struct {
	liveLog        *livelog.LiveLog
	artifactName   string
	exposure       expose.Exposure
	task           *TaskRun
	backingLogFile *os.File
}

func (l *LiveLogTask) ReservedArtifacts() []string {
	return []string{
		l.artifactName,
	}
}

func (feature *LiveLogFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &LiveLogTask{
		artifactName: task.Payload.Logs.Live,
		task:         task,
	}
}

func (l *LiveLogTask) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (l *LiveLogTask) Start() *CommandExecutionError {
	liveLog, err := livelog.New(config.LiveLogExecutable, config.LiveLogPortBase, config.LiveLogPortBase+1)
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
	if l.task.Payload.Features.BackingLog {
		log.Printf("Linking %v to %v", l.artifactName, l.task.Payload.Logs.Backing)
		err.add(l.task.uploadArtifact(
			&artifacts.LinkArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name: l.artifactName,
					// same expiry as underlying log it points to
					Expires: l.task.Definition.Expires,
				},
				ContentType: "text/plain; charset=utf-8",
				Artifact:    l.task.Payload.Logs.Backing,
			},
		))
	}

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
	l.exposure, err = exposer.ExposeHTTP(config.LiveLogPortBase + 1)
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
		&artifacts.RedirectArtifact{
			BaseArtifact: &artifacts.BaseArtifact{
				Name:    l.artifactName,
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
