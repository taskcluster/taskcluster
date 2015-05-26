package auth

// See test_setup_test.go for test setup...

import (
	"testing"
)

// Stub server to send three 5xx failure status code responses
// before finally sending a 200 response. Make sure the retry
// library retries until it gets the 200 response.
func TestRetry5xx(t *testing.T) {

	handler.QueueResponse("fail", 500)
	handler.QueueResponse("fail", 501)
	handler.QueueResponse("fail", 502)
	handler.QueueResponse("success", 200)
	handler.QueueResponse("fail", 502)

	_, callSummary := auth.ModifyClient(
		"gjhvsdfvrnbvsdvfkjhvds",
		&GetClientCredentialsResponse1{
			Description: "a nice client",
			Expires:     expires,
			Name:        "pmoore_test",
			Scopes:      []string{"*"},
		},
	)

	if statusCode := callSummary.HttpResponse.StatusCode; statusCode != 200 {
		t.Errorf("API retry logic broken - expected response code 200, but received code %v...\n", statusCode)
	}

	if body := callSummary.HttpResponseBody; body != "success" {
		t.Errorf("Was expecting http response 'success' but actually got '%v'...\n", body)
	}

	// clean up...
	handler.ClearResponseQueue()
}

// Want to make sure 4xx errors are not retried...
func TestRetry4xx(t *testing.T) {
	handler.QueueResponse("fail", 409)
	handler.QueueResponse("success", 200)

	_, callSummary := auth.ModifyClient(
		"gjhvsdfvrnbvsdvfkjhvds",
		&GetClientCredentialsResponse1{
			Description: "a nice client",
			Expires:     expires,
			Name:        "pmoore_test",
			Scopes:      []string{"*"},
		},
	)

	if statusCode := callSummary.HttpResponse.StatusCode; statusCode != 409 {
		t.Errorf("API retry logic broken - expected response code 409, but received code %v...\n", statusCode)
	}

	if body := callSummary.HttpResponseBody; body != "fail" {
		t.Errorf("Was expecting http response 'fail' but actually got '%v'...\n", body)
	}

	// clean up...
	handler.ClearResponseQueue()
}

// Test network failures get retried
func TestNetworkFailure(t *testing.T) {

	// bad port
	oldBaseURL := auth.BaseURL
	auth.BaseURL = "http://localhost:55084/api/AuthAPI/v1"

	_, callSummary := auth.ModifyClient(
		"gjhvsdfvrnbvsdvfkjhvds",
		&GetClientCredentialsResponse1{
			Description: "a nice client",
			Expires:     expires,
			Name:        "pmoore_test",
			Scopes:      []string{"*"},
		},
	)

	if attempts := callSummary.Attempts; attempts < 4 {
		t.Errorf("Was expecting at least 4 retry attempts, but were only %v...\n", attempts)
	}

	// clean up...
	auth.BaseURL = oldBaseURL
}
