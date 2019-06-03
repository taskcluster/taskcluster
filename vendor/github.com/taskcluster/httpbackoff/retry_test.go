package httpbackoff

// See test_setup_test.go for test setup...

import (
	"testing"
)

// Stub server to send three 5xx failure status code responses
// before finally sending a 200 resp. Make sure the retry
// library retries until it gets the 200 resp.
func TestRetry5xx(t *testing.T) {

	handler.QueueResponse(500)
	handler.QueueResponse(501)
	handler.QueueResponse(502)
	handler.QueueResponse(200)
	handler.QueueResponse(502)

	// defer clean up in case we have t.Fatalf calls
	defer handler.ClearResponseQueue()

	resp, _, err := testClient.Get("http://localhost:50849/TestRetry5xx")

	if err != nil {
		t.Fatalf("%v\n", err)
	}

	if statusCode := resp.StatusCode; statusCode != 200 {
		t.Errorf("API retry logic broken - expected response code 200, but received code %v...\n", statusCode)
	}
}

// Want to make sure 4xx errors are not retried...
func TestRetry4xx(t *testing.T) {
	handler.QueueResponse(409)
	handler.QueueResponse(200)

	// defer clean up in case we have t.Fatalf calls
	defer handler.ClearResponseQueue()

	resp, _, err := testClient.Get("http://localhost:50849/TestRetry4xx")

	// NB: this is == not != since we *want* an error
	if err == nil {
		t.Errorf("Was expecting Get call to return an error, due to 409 status code\n")
	}

	if statusCode := resp.StatusCode; statusCode != 409 {
		t.Errorf("API retry logic broken - expected response code 409, but received code %v...\n", statusCode)
	}
}

// Test network failures get retried
func TestNetworkFailure(t *testing.T) {

	// bad port
	_, attempts, err := testClient.Get("http://localhost:40849/TestNetworkFailure")

	// NB: this is == not != since we *want* an error
	if err == nil {
		t.Errorf("Was expecting Get call to return an error, due to 409 status code\n")
	}

	if attempts < 4 {
		t.Errorf("Was expecting at least 4 retry attempts, but were only %v...\n", attempts)
	}
}
