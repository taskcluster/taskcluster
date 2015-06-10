package main

import (
	"github.com/taskcluster/taskcluster-client-go/queue"
	"os"
	"strconv"
	"time"
)

// This function is called in a dedicated go routine to both serve signed urls
// and to update them before they expire
func SignedURLsManager() {
	// prematurity specifies the number of seconds prior to expiry that new
	// signed urls should be fetched, in order that stale credentials are not
	// used. Should be at least a few seconds.
	prematurity := os.Getenv("REFRESH_URLS_PREMATURELY_SECS")
	// convert number of seconds to an integer
	premInt, err := strconv.Atoi(prematurity)
	if err != nil {
		debug("Environment variable REFRESH_URLS_PREMATURELY_SECS should be an integer number of seconds, but is '%v'.", prematurity)
		debug("This variable represents the number of seconds before signed URLs expire, that they should be refreshed.")
		os.Exit(1)
	}
	// signedURLs is the variable where we store the current valid signed urls
	var signedURLs *queue.PollTaskUrlsResponse
	// updateMe is a channel to send a message to when we need to update signed
	// urls because either we don't have any yet (i.e. first time) or they are
	// about to expire...
	updateMe := make(<-chan time.Time)
	// function to refresh signed urls
	updateUrls := func() {
		// When a worker wants to poll for pending tasks it must call
		// `queue.pollTaskUrls(provisionerId, workerType)` which then returns
		// an array of objects on the form `{signedPollUrl, signedDeleteUrl}`.
		signedURLs, _ = Queue.PollTaskUrls(os.Getenv("PROVISIONER_ID"), os.Getenv("WORKER_TYPE"))
		// Set reminder to update signed urls again when they are
		// approximately REFRESH_URLS_PREMATURELY_SECS seconds before
		// expiring...
		// We do this by updating updateMe channel, so that on future
		// iterations of this select statement, we read from this new
		// channel.
		updateMe = time.After(signedURLs.Expires.Sub(time.Now().Add(time.Second * time.Duration(premInt))))
		for _, q := range signedURLs.Queues {
			debug("  Delete URL: " + q.SignedDeleteUrl)
			debug("  Poll URL:   " + q.SignedPollUrl)
		}
	}
	// Get signed urls for the first time...
	updateNeeded := true
	// loop forever, serving requests for signed urls, or requests to refresh
	// signed urls since they are about to expire...
	for {
		select {
		// request comes in for the current signed urls, which should be valid
		case replyChan := <-signedURLsRequestChan:
			if updateNeeded {
				updateUrls()
				updateNeeded = false
			}
			// reply on the given channel with the signed urls
			replyChan <- signedURLs
		// this is where we are notified that our signed urls are shorlty
		// before expiring, so we need to refresh them...
		case <-updateMe:
			// update the signed urls
			updateNeeded = true
		}
	}
}
