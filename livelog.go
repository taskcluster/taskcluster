package main

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"time"

	"github.com/taskcluster/generic-worker/expose"
	"github.com/taskcluster/generic-worker/livelog"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

var (
	livelogName = "public/logs/live.log"
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
	exposer        expose.Exposer
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
	liveLog, err := livelog.New(config.LiveLogExecutable, config.LiveLogPUTPort, config.LiveLogGETPort)
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

	// TODO: move this into main.go, pass it to this func
	var expErr error
	if config.LiveLogSecret != "" {
		// add an extra 15 minutes, to adequately cover client/server clock drift or
		// task initialisation delays
		urlLifetime := time.Duration(l.task.Payload.MaxRunTime+900) * time.Second
		l.exposer, expErr = expose.NewStatelessDNS(
			config.PublicIP,
			config.Subdomain,
			config.LiveLogSecret,
			urlLifetime,
			config.LiveLogCertificate,
			config.LiveLogKey)
		if expErr != nil {
			log.Printf("WARNING: could not expose livelog artifact: %s", expErr)
		}
	} else {
		l.exposer, expErr = expose.NewLocal(config.PublicIP)
		if expErr != nil {
			log.Printf("WARNING: could not expose livelog artifact: %s", expErr)
		}
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
	logURL := fmt.Sprintf("%v/task/%v/runs/%v/artifacts/%v", queue.BaseURL, l.task.TaskID, l.task.RunID, logName)
	err.add(l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name: livelogName,
				// same expiry as underlying log it points to
				Expires:     l.task.Definition.Expires,
				ContentType: "text/plain; charset=utf-8",
			},
			URL: logURL,
		},
	))

	if l.exposure != nil {
		closeErr := l.exposure.Close()
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
	l.exposure, err = l.exposer.ExposeHTTP(config.LiveLogGETPort)
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

	expires := time.Now().Add(time.Duration(l.task.Payload.MaxRunTime+900) * time.Second)
	uploadErr := l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name:        livelogName,
				Expires:     tcclient.Time(expires),
				ContentType: "text/plain; charset=utf-8",
			},
			URL: exposeURL.String(),
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
