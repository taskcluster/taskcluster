package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v24"
)

var (
	rootURL         = os.Getenv("TASKCLUSTER_ROOT_URL")
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

func testWithPermCreds(t *testing.T, test IntegrationTest, expectedStatusCode int) {
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
			"X-Taskcluster-Proxy-Revision":      revision,
			"X-Taskcluster-Proxy-Perm-ClientId": permCredentials.ClientID,
			// N.B. the http library does not distinguish between header entries
			// that have an empty "" value, and non-existing entries
			"X-Taskcluster-Proxy-Temp-ClientId": "",
			"X-Taskcluster-Proxy-Temp-Scopes":   "",
		},
	)
}

func testWithTempCreds(t *testing.T, test IntegrationTest, expectedStatusCode int) {
	tempScopes := []string{
		"assume:project:taskcluster:taskcluster-proxy-tester",
	}

	tempScopesBytes, err := json.Marshal(tempScopes)
	if err != nil {
		t.Fatal("Bug in test")
	}
	tempScopesJSON := string(tempScopesBytes)

	tempCredsClientID := "project/taskcluster/testing/temp/" + slugid.Nice()
	tempCredentials, err := permCredentials.CreateNamedTemporaryCredentials(tempCredsClientID, 1*time.Hour, tempScopes...)
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
			"X-Taskcluster-Proxy-Revision":      revision,
			"X-Taskcluster-Proxy-Temp-ClientId": tempCredsClientID,
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
	// Make sure we get at least a few bytes of a response body...
	// Even HTTP 303 should have some body, see
	// https://tools.ietf.org/html/rfc7231#section-6.4.4
	// TestRetrievePrivateArtifact retrieves an artifact with
	// 14 bytes, so let's set that as minimum.
	if len(respBody) < 14 {
		t.Error("Expected a response body (at least 14 bytes), but get less (or none).")
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
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				RootURL:     rootURL,
				Credentials: creds,
			},
		)
		u := tcurls.API(rootURL, "secrets", "v1", "project/taskcluster/testing/tcproxy/a")
		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/bewit",
			bytes.NewBufferString(u),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.BewitHandler(res, req)

		if res.Code != 303 {
			t.Fatalf("Got non-303 response: %d with body %s", res.Code, res.Body.String())
		}

		// Validate results
		bewitURLFromLocation := res.Header().Get("Location")
		bewitURLFromResponseBody := res.Body.String()
		if bewitURLFromLocation != bewitURLFromResponseBody {
			t.Fatalf("Got inconsistent results between Location header (%v) and Response body (%v).", bewitURLFromLocation, bewitURLFromResponseBody)
		}
		_, err = url.Parse(bewitURLFromLocation)
		if err != nil {
			t.Fatalf("Bewit URL returned is invalid: %q", bewitURLFromLocation)
		}
		resp, _, err := newTestClient().Get(bewitURLFromLocation)
		if err != nil {
			httpError, ok := err.(httpbackoff.BadHttpResponseCode)
			if !ok {
				t.Fatalf("Exception thrown:\n%s", err)
			}
			// secrets service only replies with 404 if the credentials and scopes are valid
			if httpError.HttpResponseCode != 404 {
				t.Fatalf("Exception thrown:\n%s", err)
			}
		}
		_, err = ioutil.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("Exception thrown:\n%s", err)
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
			routes := NewRoutes(
				rootURL,
				tcclient.Client{
					Authenticate: true,
					Credentials: &tcclient.Credentials{
						ClientID:         creds.ClientID,
						AccessToken:      creds.AccessToken,
						Certificate:      creds.Certificate,
						AuthorizedScopes: scopes,
					},
				},
			)

			// Requires scope "auth:azure-table:read-write:fakeaccount/DuMmYtAbLe"
			req, err := http.NewRequest(
				"GET", "http://localhost:60024/api/secrets/v1/secret/project/taskcluster/testing/tcproxy/a",
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
			routes.APIHandler(res, req)
			return res
		}
	}
	testWithPermCreds(t, test("A", []string{"secrets:get:project/taskcluster/testing/tcproxy/a"}), 404)
	testWithTempCreds(t, test("B", []string{"secrets:get:project/taskcluster/testing/tcproxy/a"}), 404)
	testWithPermCreds(t, test("C", []string{"secrets:get:project/taskcluster/testing/tcproxy/someothersecret"}), 403)
	testWithTempCreds(t, test("D", []string{"secrets:get:project/taskcluster/testing/tcproxy/someothersecret"}), 403)
}

func TestAPICallWithPayload(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				RootURL:     rootURL,
				Credentials: creds,
			},
		)
		expires := time.Now()

		req, err := http.NewRequest(
			"PUT",
			// note that we do not expect to have permissions to create this; 403 is success
			// TODO: ^^ not actually true as it doesn't check the body until auth is OK
			"http://localhost:60024/secrets/v1/secret/project/taskcluster/testing/tcproxy/xxx",
			bytes.NewBufferString(`{
			  "expires": "`+tcclient.Time(expires).String()+`",
			  "secret": {},
			}`),
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		return res
	}
	testWithPermCreds(t, test, 403)
	testWithTempCreds(t, test, 403)
}

func TestNon200HasErrorBody(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		)
		taskID := slugid.Nice()

		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/queue/v1/task/"+taskID+"/define",
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
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		)

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
				"X-Taskcluster-Endpoint":          tcurls.API(rootURL, "secrets", "v1", "secret/garbage/pmoore/foo"),
				"X-Taskcluster-Authorized-Scopes": `["secrets:get:garbage/pmoore/foo"]`,
			},
		)
		return res
	}
	testWithTempCreds(t, test, 401)
}

func TestBadCredsReturns500(t *testing.T) {
	routes := NewRoutes(
		rootURL,
		tcclient.Client{
			Authenticate: true,
			Credentials: &tcclient.Credentials{
				ClientID:    "abc",
				AccessToken: "def",
				Certificate: "ghi", // baaaad certificate
			},
		},
	)
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
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				Authenticate: true,
				Credentials:  creds,
			},
		)

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

func TestRetrieveSecret(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {

		// Test setup
		routes := NewRoutes(
			rootURL,
			tcclient.Client{
				RootURL:      rootURL,
				Authenticate: true,
				Credentials:  creds,
			},
		)

		req, err := http.NewRequest(
			"GET",
			"http://localhost:60024/secrets/v1/secret/project/taskcluster/testing/tcproxy/somesecret",
			nil,
		)
		if err != nil {
			log.Fatal(err)
		}
		res := httptest.NewRecorder()

		// Function to test
		routes.RootHandler(res, req)

		fmt.Printf("res: %#v\n", res)
		fmt.Printf("res.Body: %s\n", res.Body.String())
		return res
	}
	testWithPermCreds(t, test, 200)
	testWithTempCreds(t, test, 200)
}
