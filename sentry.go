package main

import (
	"log"
	"strconv"

	raven "github.com/getsentry/raven-go"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
)

func ReportCrashToSentry(r interface{}) {
	if config.Project == "" {
		log.Println("No sentry project defined, not reporting to sentry")
		return
	}
	Auth := auth.New(
		&tcclient.Credentials{
			ClientID:    config.ClientID,
			AccessToken: config.AccessToken,
			Certificate: config.Certificate,
		},
	)
	res, err := Auth.SentryDSN(config.Project)
	if err != nil {
		log.Printf("WARNING: Could not get sentry DSN: %v", err)
		return
	}
	client, err := raven.New(res.Dsn.Secret)
	if err != nil {
		log.Printf("Could not create raven client for reporting to sentry: %v", err)
		return
	}
	_, _ = client.CapturePanicAndWait(
		func() {
			panic(r)
		},
		map[string]string{
			"cleanUpTaskDirs":       strconv.FormatBool(config.CleanUpTaskDirs),
			"deploymentId":          config.DeploymentID,
			"instanceType":          config.InstanceType,
			"runTasksAsCurrentUser": strconv.FormatBool(config.RunTasksAsCurrentUser),
			"workerGroup":           config.WorkerGroup,
			"workerId":              config.WorkerID,
			"workerType":            config.WorkerType,
		},
	)
}
