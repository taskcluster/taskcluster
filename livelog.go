package main

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"time"

	"github.com/taskcluster/generic-worker/livelog"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/stateless-dns-go/hostname"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type LiveLogFeature struct {
}

func (feature *LiveLogFeature) Name() string {
	return "Live Log"
}

func (feature *LiveLogFeature) Initialise() error {
	return nil
}

// livelog is always enabled
func (feature *LiveLogFeature) IsEnabled(fl EnabledFeatures) bool {
	return true
}

type LiveLogTask struct {
	// The canonical name of the log file as reported to the Queue, which
	// is typically the relative location of the log file to the user home
	// directory
	liveLog *livelog.LiveLog
	task    *TaskRun
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
	liveLog, err := livelog.New(config.LiveLogExecutable, config.LiveLogCertificate, config.LiveLogKey)
	if err != nil {
		log.Printf("WARN: could not create livelog: %s", err)
		// then run without livelog, is only a "best effort" service
		return nil
	}
	l.liveLog = liveLog
	l.task.logWriter = io.MultiWriter(liveLog.LogWriter, l.task.logWriter)
	setCommandLogWriters(l.task.Commands, l.task.logWriter)

	err = l.uploadLiveLog()
	if err != nil {
		log.Printf("WARN: could not upload livelog: %s", err)
	}
	return nil
}

func (l *LiveLogTask) Stop() *CommandExecutionError {
	// if livelog couldn't be started, nothing to do here...
	if l.liveLog == nil {
		return nil
	}
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
	log.Print("Redirecting live.log to live_backing.log")
	logURL := fmt.Sprintf("%v/task/%v/runs/%v/artifacts/%v", Queue.BaseURL, l.task.TaskID, l.task.RunID, "public/logs/live_backing.log")
	err := l.task.uploadArtifact(
		RedirectArtifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: "public/logs/live.log",
				// same expiry as underlying log it points to
				Expires: l.task.Definition.Expires,
			},
			MimeType: "text/plain; charset=utf-8",
			URL:      logURL,
		},
	)
	if err != nil {
		return ResourceUnavailable(err)
	}
	return nil
}

func (l *LiveLogTask) uploadLiveLog() error {
	maxRunTimeDeadline := time.Time(l.task.TaskClaimResponse.Status.Runs[l.task.RunID].Started).Add(time.Duration(l.task.Payload.MaxRunTime) * time.Second)
	// deduce stateless DNS name to use
	statelessHostname := hostname.New(config.PublicIP, config.Subdomain, maxRunTimeDeadline, config.LiveLogSecret)
	getURL, err := url.Parse(l.liveLog.GetURL)
	if err != nil {
		return err
	}
	getURL.Scheme = "https"
	getURL.Host = statelessHostname + ":60023"
	uploadErr := l.task.uploadArtifact(
		RedirectArtifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: "public/logs/live.log",
				// livelog expires when task must have completed
				Expires: tcclient.Time(maxRunTimeDeadline),
			},
			MimeType: "text/plain; charset=utf-8",
			URL:      getURL.String(),
		},
	)
	if uploadErr != nil {
		return uploadErr
	}
	// note this will be error(nil) not *CommandExecutionError(nil)
	return nil
}

func setCommandLogWriters(commands []*process.Command, logWriter io.Writer) {
	for i, _ := range commands {
		commands[i].DirectOutput(logWriter)
	}
}
