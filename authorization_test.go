package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"os"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

var (
	permCredentials = &tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
)

// Requires scope "auth:azure-table-access:fakeaccount/DuMmYtAbLe"
func sharedAccessSignature() string {
	return fmt.Sprintf(
		"https://localhost:60024/auth/v1/azure/%s/table/%s/read-write",
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

		// Test setup
		routes := Routes(tcclient.ConnectionData{
			Credentials: creds,
		})
		req, err := http.NewRequest("POST", "https://localhost:60024/bewit", bytes.NewBufferString("https://queue.taskcluster.net/v1/task/DD1kmgFiRMWTjyiNoEJIMA/runs/0/artifacts/private%2Fbuild%2Fsources.xml"))
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.ServeHTTP(res, req)

		// Validate results
		if res.Code != 303 {
			t.Fatalf("Expected status code 303 but got %v", res.Code)
		}
		bewitUrl := res.Header().Get("Location")
		resp, _, err := httpbackoff.Get(bewitUrl)
		if err != nil {
			t.Fatalf("Exception thrown:\n%s", err)
		}
		respBody, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("Exception thrown:\n%s", err)
		}
		if len(respBody) != 18170 {
			t.Logf("Response received:\n%s", string(respBody))
			t.Fatalf("Expected response body to be 18170 bytes, but was %v bytes", len(respBody))
		}
	}
	testWithPermCreds(t, test)
	testWithTempCreds(t, test)
}

func TestAuthorizationDelegate(t *testing.T) {
	test := func(name string, statusCode int, scopes []string) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) {
			// Test setup
			routes := Routes(tcclient.ConnectionData{
				Authenticate: true,
				Credentials: &tcclient.Credentials{
					ClientId:         creds.ClientId,
					AccessToken:      creds.AccessToken,
					Certificate:      creds.Certificate,
					AuthorizedScopes: scopes,
				},
			})

			req, err := http.NewRequest("GET", sharedAccessSignature(), nil)
			if err != nil {
				log.Fatal(err)
			}
			res := httptest.NewRecorder()

			// Function to test
			routes.ServeHTTP(res, req)

			// Validate results

			if res.Code != statusCode {
				t.Logf("Part %s) Expected delgated request to fail with HTTP %v - but got HTTP %v", name, statusCode, res.Code)
				respBody, err := ioutil.ReadAll(res.Body)
				t.Logf("Headers: %s", res.Header())
				if err == nil {
					t.Logf("Response received:\n%s", string(respBody))
				}
				t.FailNow()
			}
		}
	}
	testWithPermCreds(t, test("A", 404, []string{"auth:azure-table-access:fakeaccount/DuMmYtAbLe"}))
	testWithTempCreds(t, test("B", 404, []string{"auth:azure-table-access:fakeaccount/DuMmYtAbLe"}))
	testWithPermCreds(t, test("C", 401, []string{"queue:get-artifact:private/build/sources.xml"}))
	testWithTempCreds(t, test("D", 401, []string{"queue:get-artifact:private/build/sources.xml"}))
}
