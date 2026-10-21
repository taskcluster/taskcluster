package main

import (
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/getsentry/sentry-go"
)

func ReportCrashToSentry(r any) {
	if config.SentryProject == "" {
		log.Println("No sentry project defined, not reporting to sentry")
		return
	}
	auth := serviceFactory.Auth(config.Credentials(), config.RootURL)
	res, err := auth.SentryDSN(config.SentryProject)
	if err != nil {
		log.Printf("WARNING: Could not get sentry DSN: %v", err)
		return
	}
	sendPanicToSentry(res.Dsn.Secret, r, debugInfo, 30*time.Second)
}

// sendPanicToSentry reports the recovered panic value r to the Sentry project
// identified by dsn, tagged with tags, waiting at most timeout for delivery.
// TLS verification uses the system root CA store.
func sendPanicToSentry(dsn string, r any, tags map[string]string, timeout time.Duration) {
	client, err := sentry.NewClient(sentry.ClientOptions{
		Dsn:     dsn,
		Release: "generic-worker@" + version,
	})
	if err != nil {
		log.Printf("Could not create sentry client: %v", err)
		return
	}
	// Like raven-go's CapturePanic, always report the panic as an exception
	// with a stack trace, so that events group consistently
	panicErr, ok := r.(error)
	if !ok {
		panicErr = errors.New(fmt.Sprint(r))
	}
	scope := sentry.NewScope()
	scope.SetTags(tags)
	hub := sentry.NewHub(client, scope)
	hub.CaptureException(panicErr)
	if !hub.Flush(timeout) {
		log.Println("WARNING: Timed out sending crash report to sentry")
	}
}
