package main

import (
	"log"
	"runtime"
	"strconv"

	raven "github.com/getsentry/raven-go"
)

func ReportCrashToSentry(r interface{}) {
	if config.SentryProject == "" {
		log.Println("No sentry project defined, not reporting to sentry")
		return
	}
	Auth := config.Auth()
	res, err := Auth.SentryDSN(config.SentryProject)
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
			"GOARCH":          runtime.GOARCH,
			"GOOS":            runtime.GOOS,
			"cleanUpTaskDirs": strconv.FormatBool(config.CleanUpTaskDirs),
			"deploymentId":    config.DeploymentID,
			"engine":          engine,
			"gwRevision":      revision,
			"gwVersion":       version,
			"instanceType":    config.InstanceType,
			"provisionerId":   config.ProvisionerID,
			"rootURL":         config.RootURL,
			"workerGroup":     config.WorkerGroup,
			"workerId":        config.WorkerID,
			"workerType":      config.WorkerType,
		},
	)
}
