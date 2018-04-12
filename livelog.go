package main

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/taskcluster/generic-worker/livelog"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/stateless-dns-go/hostname"
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
	// The canonical name of the log file as reported to the Queue, which
	// is typically the relative location of the log file to the user home
	// directory
	liveLog        *livelog.LiveLog
	task           *TaskRun
	backingLogFile *os.File
}

func (feature *LiveLogTask) ReservedArtifacts() []string {
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
	liveLog, err := livelog.New(config.LiveLogExecutable, config.LiveLogCertificate, config.LiveLogKey, config.LiveLogPUTPort, config.LiveLogGETPort)
	if err != nil {
		log.Printf("WARN: could not create livelog: %s", err)
		// then run without livelog, is only a "best effort" service
		return nil
	}
	l.liveLog = liveLog
	updateErr := l.updateTaskLogWriter(liveLog.LogWriter)
	if updateErr != nil {
		return updateErr
	}

	err = l.uploadLiveLog()
	if err != nil {
		log.Printf("WARN: could not upload livelog: %s", err)
	}
	return nil
}

func (l *LiveLogTask) updateTaskLogWriter(liveLogWriter io.Writer) *CommandExecutionError {
	// store current writer so it can be reinstated later when stopping livelog
	l.task.logMux.Lock()
	defer l.task.logMux.Unlock()
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

func (l *LiveLogTask) Stop() *CommandExecutionError {
	// if livelog couldn't be started, nothing to do here...
	if l.liveLog == nil {
		return nil
	}
	l.reinstateBackingLog()
	errClose := l.liveLog.LogWriter.Close()
	if errClose != nil {
		// no need to raise an exception
		log.Printf("WARN: could not close livelog writer: %s", errClose)
	}
	errTerminate := l.liveLog.Terminate()
	if errTerminate != nil {
		// no need to raise an exception
		log.Printf("WARN: could not terminate livelog writer: %s", errTerminate)
	}
	log.Printf("Redirecting %v to %v", livelogName, logName)
	logURL := fmt.Sprintf("%v/task/%v/runs/%v/artifacts/%v", queue.BaseURL, l.task.TaskID, l.task.RunID, logName)
	err := l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name: livelogName,
				// same expiry as underlying log it points to
				Expires:     l.task.Definition.Expires,
				ContentType: "text/plain; charset=utf-8",
			},
			URL: logURL,
		},
	)
	if err != nil {
		return ResourceUnavailable(err)
	}
	return nil
}

func (l *LiveLogTask) reinstateBackingLog() {
	l.task.logMux.Lock()
	defer l.task.logMux.Unlock()
	l.task.logWriter = l.backingLogFile
}

func (l *LiveLogTask) uploadLiveLog() error {
	maxRunTimeDeadline := l.task.LocalClaimTime.Add(time.Duration(l.task.Payload.MaxRunTime) * time.Second)
	// deduce stateless DNS name to use
	statelessHostname := hostname.New(config.PublicIP, config.Subdomain, maxRunTimeDeadline, config.LiveLogSecret)
	getURL, err := url.Parse(l.liveLog.GetURL)
	if err != nil {
		return err
	}
	if l.liveLog.SSLCert != "" && l.liveLog.SSLKey != "" {
		getURL.Scheme = "https"
	} else {
		getURL.Scheme = "http"
	}
	getURL.Host = statelessHostname + ":" + strconv.Itoa(int(l.liveLog.GETPort))
	uploadErr := l.task.uploadArtifact(
		&RedirectArtifact{
			BaseArtifact: &BaseArtifact{
				Name: livelogName,
				// livelog expires when task must have completed
				Expires:     tcclient.Time(maxRunTimeDeadline),
				ContentType: "text/plain; charset=utf-8",
			},
			URL: getURL.String(),
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
