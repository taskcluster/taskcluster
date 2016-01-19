package taskcluster_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httputil"
	"os"
	"regexp"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

var (
	permCredentials = &tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
)

func artifactUrl() string {
	return "https://queue.taskcluster.net/v1/task/DD1kmgFiRMWTjyiNoEJIMA/runs/0/artifacts/private%2Fbuild%2Fsources.xml"
}

// Requires scope "auth:azure-table-access:fakeaccount/DuMmYtAbLe"
func sharedAccessSignature() string {
	return fmt.Sprintf(
		"https://auth.taskcluster.net/v1/azure/%s/table/%s/read-write",
		"fakeaccount",
		"DuMmYtAbLe",
	)
}

type IntegrationTest func(t *testing.T, creds *tcclient.Credentials)

type ScopesResponse struct {
	ClientId       string   `json:"clientId"`
	ExpandedScopes []string `json:"expandedScopes"`
	Expires        string   `json:"expires"`
}

// Decode a json response from the server..
func readJson(http *http.Response) (*ScopesResponse, error) {
	scopesResponse := new(ScopesResponse)
	resp, err := httputil.DumpResponse(http, true)
	if err != nil {
		return nil, err
	}
	json := json.NewDecoder(http.Body)
	err = json.Decode(scopesResponse)
	if err != nil {
		return nil, errors.New(fmt.Sprintf("HTTP response could not be read into a Scopes Response:\n%s\n\nHTTP Body:\n%s", err, resp))
	}
	return scopesResponse, nil
}

func skipIfNoPermCreds(t *testing.T) {
	if permCredentials.ClientId == "" {
		t.Skip("TASKCLUSTER_CLIENT_ID not set - skipping test")
	}
	if permCredentials.AccessToken == "" {
		t.Skip("TASKCLUSTER_ACCESS_TOKEN not set - skipping test")
	}
}

func testWithPermCreds(t *testing.T, test IntegrationTest) {
	skipIfNoPermCreds(t)
	test(t, permCredentials)
}

func testWithTempCreds(t *testing.T, test IntegrationTest) {
	skipIfNoPermCreds(t)
	tempCredentials, err := permCredentials.CreateTemporaryCredentials(1*time.Hour, "queue:get-artifact:private/build/sources.xml", "auth:azure-table-access:fakeaccount/DuMmYtAbLe")
	if err != nil {
		t.Fatalf("Could not generate temp credentials")
	}
	test(t, tempCredentials)
}

func TestBewit(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) {
		url := artifactUrl()

		bewitUrl, err := tc.Bewit(creds.ClientId, creds.AccessToken, creds.Certificate, url)
		if err != nil {
			t.Errorf("Failed to create bewit %v", err)
		}

		httpClient := &http.Client{}
		req, err := http.NewRequest("GET", bewitUrl, nil)
		if err != nil {
			t.Errorf("Failed to create request: %s", err)
		}
		reqBytes, err := httputil.DumpRequest(req, true)
		if err != nil {
			t.Fatalf("Error dumping request:\n%s", err)
		}
		resp, err := httpClient.Do(req)
		if err != nil {
			t.Errorf("Error issuing request", err)
		}

		// Ensure the body is closed after this test.
		defer resp.Body.Close()

		respBody, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
			t.Logf("Request sent:\n%s", protectedRequest)
			t.Fatalf("Exception thrown:\n%s", err)
		}
		if len(respBody) != 18170 {
			protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
			t.Logf("Request sent:\n%s", protectedRequest)
			t.Logf("Response received:\n%s", string(respBody))
			t.Fatalf("Expected response body to be 18170 bytes, but was %v bytes", len(respBody))
		}
	}
	testWithPermCreds(t, test)
	testWithTempCreds(t, test)
}

func TestAuthorization(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) {

		httpClient := &http.Client{}

		req, err := http.NewRequest("GET", artifactUrl(), nil)
		if err != nil {
			t.Errorf("Failed to create request: %s", err)
		}

		req.Header.Add(
			"Authorization",
			tc.Authorization(creds.ClientId, creds.AccessToken, creds.Certificate, req),
		)
		reqBytes, err := httputil.DumpRequest(req, true)
		if err != nil {
			t.Fatalf("Error dumping request:\n%s", err)
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			t.Errorf("Error issuing request", err)
		}

		// Ensure the body is closed after this test.
		defer resp.Body.Close()

		respBody, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
			t.Logf("Request sent:\n%s", protectedRequest)
			t.Fatalf("Exception thrown:\n%s", err)
		}
		if len(respBody) != 18170 {
			protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
			t.Logf("Request sent:\n%s", protectedRequest)
			t.Fatalf("Expected response body to be 18170 bytes, but was %v bytes", len(respBody))
		}
	}
	testWithPermCreds(t, test)
	testWithTempCreds(t, test)
}

func TestAuthorizationDelegate(t *testing.T) {
	test := func(statusCode int, scopes []string) func(t *testing.T, creds *tcclient.Credentials) {
		return func(t *testing.T, creds *tcclient.Credentials) {
			httpClient := &http.Client{}

			req, err := http.NewRequest("GET", sharedAccessSignature(), nil)
			if err != nil {
				t.Errorf("Failed to create request: %s", err)
			}

			header, err := tc.AuthorizationDelegate(creds.ClientId, creds.AccessToken, creds.Certificate, scopes, req)

			if err != nil {
				t.Fatalf("Failed to create delegating auth %s", err)
			}

			req.Header.Add("Authorization", header)
			reqBytes, err := httputil.DumpRequest(req, true)
			if err != nil {
				t.Fatalf("Error dumping request:\n%s", err)
			}

			resp, err := httpClient.Do(req)
			if err != nil {
				t.Fatalf("Error issuing request:\n%s", err)
			}

			// Ensure the body is closed after this test.
			defer resp.Body.Close()

			if resp.StatusCode != statusCode {
				protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
				t.Logf("Expected delgated request to fail with HTTP %v since it has no scopes - but got HTTP %v", statusCode, resp.StatusCode)
				t.Logf("Request sent:\n%s", protectedRequest)
				respBody, err := ioutil.ReadAll(resp.Body)
				if err == nil {
					t.Fatalf("Response received:\n%s", respBody)
				}
			}
		}
	}
	testWithPermCreds(t, test(404, []string{"auth:azure-table-access:fakeaccount/DuMmYtAbLe"}))
	testWithTempCreds(t, test(404, []string{"auth:azure-table-access:fakeaccount/DuMmYtAbLe"}))
	testWithPermCreds(t, test(401, []string{"queue:get-artifact:private/build/sources.xml"}))
	testWithTempCreds(t, test(401, []string{"queue:get-artifact:private/build/sources.xml"}))
}
