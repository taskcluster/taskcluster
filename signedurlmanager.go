package main

import (
	"log"
	"time"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

// This function is called in a dedicated go routine to both serve signed urls
// and to update them before they expire
func SignedURLsManager() (chan chan *queue.PollTaskUrlsResponse, chan *queue.PollTaskUrlsResponse) {
	requestChan := make(chan chan *queue.PollTaskUrlsResponse)
	responseChan := make(chan *queue.PollTaskUrlsResponse)
	// prematurity specifies the number of seconds prior to expiry that new
	// signed urls should be fetched, in order that stale credentials are not
	// used. Should be at least a few seconds.
	prematurity := config.RefreshUrlsPrematurelySecs
	// signedURLs is the variable where we store the current valid signed urls
	var signedURLs *queue.PollTaskUrlsResponse
	var err error
	// updateMe is a channel to send a message to when we need to update signed
	// urls because either we don't have any yet (i.e. first time) or they are
	// about to expire...
	updateMe := make(<-chan time.Time)
	// function to refresh signed urls
	updateUrls := func() {
		// When a worker wants to poll for pending tasks it must call
		// `queue.pollTaskUrls(provisionerId, workerType)` which then returns
		// an array of objects on the form `{signedPollUrl, signedDeleteUrl}`.
		signedURLs, err = Queue.PollTaskUrls(config.ProvisionerID, config.WorkerType)
		// TODO: not sure if this is the right thing to do. If Queue has an outage, maybe better to
		// do expoenential backoff indefinitely?
		if err != nil {
			panic(err)
		}
		// Set reminder to update signed urls again when they are
		// approximately REFRESH_URLS_PREMATURELY_SECS seconds before
		// expiring...
		// We do this by updating updateMe channel, so that on future
		// iterations of this select statement, we read from this new
		// channel.
		refreshWait := time.Time(signedURLs.Expires).Sub(time.Now().Add(time.Second * time.Duration(prematurity)))
		log.Printf("Refreshing signed urls in %v", refreshWait.String())
		updateMe = time.After(refreshWait)
		for i, q := range signedURLs.Queues {
			log.Printf("  Priority (%v) Delete URL: %v", i+1, q.SignedDeleteURL)
			log.Printf("  Priority (%v) Poll URL:   %v", i+1, q.SignedPollURL)
		}
	}
	// Get signed urls for the first time...
	updateNeeded := true
	// loop forever, serving requests for signed urls, or requests to refresh
	// signed urls since they are about to expire...
	go func() {
		for {
			select {
			// request comes in for the current signed urls, which should be valid
			case replyChan := <-requestChan:
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
	}()
	return requestChan, responseChan
}
