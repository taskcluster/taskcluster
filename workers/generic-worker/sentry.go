package main

import (
	"log"

	raven "github.com/getsentry/raven-go"
)

func ReportCrashToSentry(r interface{}) {
	if config.SentryProject == "" {
		log.Println("No sentry project defined, not reporting to sentry")
		return
	}
	Auth := serviceFactory.Auth(config.Credentials(), config.RootURL)
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
		debugInfo,
	)
}
