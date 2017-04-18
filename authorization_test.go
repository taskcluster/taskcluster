package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/cenkalti/backoff"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

var (
	permCredentials = &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
)

func newTestClient() *httpbackoff.Client {
	return &httpbackoff.Client{
		BackOffSettings: &backoff.ExponentialBackOff{
			InitialInterval:     1 * time.Millisecond,
			RandomizationFactor: 0.2,
			Multiplier:          1.2,
			MaxInterval:         5 * time.Millisecond,
			MaxElapsedTime:      20 * time.Millisecond,
			Clock:               backoff.SystemClock,
		},
	}
}

type IntegrationTest func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder

func skipIfNoPermCreds(t *testing.T) {
	if permCredentials.ClientID == "" {
		t.Skip("TASKCLUSTER_CLIENT_ID not set - skipping test")
	}
	if permCredentials.AccessToken == "" {
		t.Skip("TASKCLUSTER_ACCESS_TOKEN not set - skipping test")
	}
}

func testWithPermCreds(t *testing.T, test IntegrationTest, expectedStatusCode int) {
	skipIfNoPermCreds(t)
	res := test(t, permCredentials)
	checkStatusCode(
		t,
		res,
		expectedStatusCode,
	)
	checkHeaders(
		t,
		res,
		map[string]string{
			"X-Taskcluster-Proxy-Version":       version,
			"X-Taskcluster-Proxy-Perm-ClientId": permCredentials.ClientID,
			// N.B. the http library does not distinguish between header entries
			// that have an empty "" value, and non-existing entries
			"X-Taskcluster-Proxy-Temp-ClientId": "",
			"X-Taskcluster-Proxy-Temp-Scopes":   "",
		},
	)
}

func testWithTempCreds(t *testing.T, test IntegrationTest, expectedStatusCode int) {
	skipIfNoPermCreds(t)
	tempScopes := []string{
		"auth:azure-table:read-write:fakeaccount/DuMmYtAbLe",
		"queue:define-task:win-provisioner/win2008-worker",
		"queue:get-artifact:private/build/sources.xml",
		"queue:route:tc-treeherder.mozilla-inbound.*",
		"queue:route:tc-treeherder-stage.mozilla-inbound.*",
		"queue:task-priority:high",
	}

	tempScopesJSON := `["auth:azure-table:read-write:fakeaccount/DuMmYtAbLe","queue:define-task:win-provisioner/win2008-worker","queue:get-artifact:private/build/sources.xml","queue:route:tc-treeherder.mozilla-inbound.*","queue:route:tc-treeherder-stage.mozilla-inbound.*","queue:task-priority:high"]`

	tempCredsClientId := "garbage/" + slugid.Nice()
	tempCredentials, err := permCredentials.CreateNamedTemporaryCredentials(tempCredsClientId, 1*time.Hour, tempScopes...)
	if err != nil {
		t.Fatalf("Could not generate temp credentials")
	}
	res := test(t, tempCredentials)
	checkStatusCode(
		t,
		res,
		expectedStatusCode,
	)
	checkHeaders(
		t,
		res,
		map[string]string{
			"X-Taskcluster-Proxy-Version":       version,
			"X-Taskcluster-Proxy-Temp-ClientId": tempCredsClientId,
			"X-Taskcluster-Proxy-Temp-Scopes":   tempScopesJSON,
			// N.B. the http library does not distinguish between header entries
			// that have an empty "" value, and non-existing entries
			"X-Taskcluster-Proxy-Perm-ClientId": "",
		},
	)
}

func checkHeaders(t *testing.T, res *httptest.ResponseRecorder, requiredHeaders map[string]string) {
	for headerKey, expectedHeaderValue := range requiredHeaders {
		actualHeaderValue := res.Header().Get(headerKey)
		if actualHeaderValue != expectedHeaderValue {
			// N.B. the http library does not distinguish between header
			// entries that have an empty "" value, and non-existing entries
			if expectedHeaderValue != "" {
				t.Errorf("Expected header %q to be %q but it was %q", headerKey, expectedHeaderValue, actualHeaderValue)
				t.Logf("Full headers: %q", res.Header())
			} else {
				t.Errorf("Expected header %q to not be present, or to be an empty string (\"\"), but it was %q", headerKey, actualHeaderValue)
			}
		}
	}
}

func checkStatusCode(t *testing.T, res *httptest.ResponseRecorder, statusCode int) {
	respBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Could not read response body: %v", err)
	}
	// make sure we get at least a few bytes of a response body...
	// even http 303 should have some body, see
	// https://tools.ietf.org/html/rfc7231#section-6.4.4
	if len(respBody) < 20 {
		t.Error("Expected a response body (at least 20 bytes), but get less (or none).")
		t.Logf("Headers: %s", res.Header())
		t.Logf("Response received:\n%s", string(respBody))
	}
	if res.Code != statusCode {
		t.Errorf("Expected status code %v but got %v", statusCode, res.Code)
		t.Logf("Headers: %s", res.Header())
		t.Logf("Response received:\n%s", string(respBody))
	}
}

func TestBewit(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := Routes{
			Client: tcclient.Client{
				Credentials: creds,
			},
		}
		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/bewit",
			bytes.NewBufferString("https://queue.taskcluster.net/v1/task/CWrFcq90Sb6ZT1eGn6ZWMA/runs/0/artifacts/private%2Fbuild%2Fsources.xml"),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.BewitHandler(res, req)

		// Validate results
		bewitUrl := res.Header().Get("Location")
		_, err = url.Parse(bewitUrl)
		if err != nil {
			t.Fatalf("Bewit URL returned is invalid: %q", bewitUrl)
		}
		resp, _, err := newTestClient().Get(bewitUrl)
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
		return res
	}
	testWithPermCreds(t, test, 303)
	testWithTempCreds(t, test, 303)
}

func TestAuthorizationDelegate(t *testing.T) {
	test := func(name string, scopes []string) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
			// Test setup
			routes := Routes{
				Client: tcclient.Client{
					Authenticate: true,
					Credentials: &tcclient.Credentials{
						ClientID:         creds.ClientID,
						AccessToken:      creds.AccessToken,
						Certificate:      creds.Certificate,
						AuthorizedScopes: scopes,
					},
				},
			}

			// Requires scope "auth:azure-table:read-write:fakeaccount/DuMmYtAbLe"
			req, err := http.NewRequest(
				"GET",
				fmt.Sprintf(
					"http://localhost:60024/auth/v1/azure/%s/table/%s/read-write",
					"fakeaccount",
					"DuMmYtAbLe",
				),
				// Note: we don't set body to nil as a server http request
				// cannot have a nil body. See:
				// https://golang.org/pkg/net/http/#Request
				new(bytes.Buffer),
			)
			if err != nil {
				log.Fatal(err)
			}
			res := httptest.NewRecorder()

			// Function to test
			routes.RootHandler(res, req)
			return res
		}
	}
	testWithPermCreds(t, test("A", []string{"auth:azure-table:read-write:fakeaccount/DuMmYtAbLe"}), 404)
	testWithTempCreds(t, test("B", []string{"auth:azure-table:read-write:fakeaccount/DuMmYtAbLe"}), 404)
	testWithPermCreds(t, test("C", []string{"queue:get-artifact:private/build/sources.xml"}), 403)
	testWithTempCreds(t, test("D", []string{"queue:get-artifact:private/build/sources.xml"}), 403)
}

func TestAPICallWithPayload(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := Routes{
			Client: tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		}
		taskId := slugid.Nice()
		taskGroupId := slugid.Nice()
		created := time.Now()
		deadline := created.AddDate(0, 0, 1)
		expires := deadline

		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/queue/v1/task/"+taskId+"/define",
			bytes.NewBufferString(
				`
{
  "provisionerId": "win-provisioner",
  "workerType": "win2008-worker",
  "schedulerId": "go-test-test-scheduler",
  "taskGroupId": "`+taskGroupId+`",
  "routes": [
    "tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
    "tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163"
  ],
  "priority": "high",
  "retries": 5,
  "created": "`+tcclient.Time(created).String()+`",
  "deadline": "`+tcclient.Time(deadline).String()+`",
  "expires": "`+tcclient.Time(expires).String()+`",
  "scopes": [
  ],
  "payload": {
    "features": {
      "relengApiProxy": true
    }
  },
  "metadata": {
    "description": "Stuff",
    "name": "[TC] Pete",
    "owner": "pmoore@mozilla.com",
    "source": "http://everywhere.com/"
  },
  "tags": {
    "createdForUser": "cbook@mozilla.com"
  },
  "extra": {
    "index": {
      "rank": 12345
    }
  }
}
`,
			),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		t.Logf("Created task https://queue.taskcluster.net/v1/task/%v", taskId)
		return res
	}
	testWithPermCreds(t, test, 200)
	testWithTempCreds(t, test, 200)
}

func TestNon200HasErrorBody(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := Routes{
			Client: tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		}
		taskId := slugid.Nice()

		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/queue/v1/task/"+taskId+"/define",
			bytes.NewBufferString(
				`{"comment": "Valid json so that we hit endpoint, but should not result in http 200"}`,
			),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		// Validate results
		return res

	}
	testWithPermCreds(t, test, 400)
	testWithTempCreds(t, test, 400)
}

func TestOversteppedScopes(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := Routes{
			Client: tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		}

		// This scope is not in the scopes of the temp credentials, which would
		// happen if a task declares a scope that the provisioner does not
		// grant.
		routes.Credentials.AuthorizedScopes = []string{"secrets:get:garbage/pmoore/foo"}

		req, err := http.NewRequest(
			"GET",
			"http://localhost:60024/secrets/v1/secret/garbage/pmoore/foo",
			new(bytes.Buffer),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		// Validate results
		checkHeaders(
			t,
			res,
			map[string]string{
				"X-Taskcluster-Endpoint":          "https://secrets.taskcluster.net/v1/secret/garbage/pmoore/foo",
				"X-Taskcluster-Authorized-Scopes": `["secrets:get:garbage/pmoore/foo"]`,
			},
		)
		return res
	}
	testWithTempCreds(t, test, 401)
}

func TestBadCredsReturns500(t *testing.T) {
	routes := Routes{
		Client: tcclient.Client{
			Authenticate: true,
			Credentials: &tcclient.Credentials{
				ClientID:    "abc",
				AccessToken: "def",
				Certificate: "ghi", // baaaad certificate
			},
		},
	}
	req, err := http.NewRequest(
		"GET",
		"http://localhost:60024/secrets/v1/secret/garbage/pmoore/foo",
		new(bytes.Buffer),
	)
	if err != nil {
		log.Fatal(err)
	}
	res := httptest.NewRecorder()

	// Function to test
	routes.RootHandler(res, req)
	// Validate results
	checkStatusCode(t, res, 500)
}

func TestInvalidEndpoint(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := Routes{
			Client: tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		}

		req, err := http.NewRequest(
			"GET",
			"http://localhost:60024/x@/", // invalid endpoint
			new(bytes.Buffer),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		// Validate results
		checkHeaders(
			t,
			res,
			map[string]string{
				"X-Taskcluster-Endpoint": "",
			},
		)
		return res
	}
	testWithTempCreds(t, test, 404)
	testWithPermCreds(t, test, 404)
}
