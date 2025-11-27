package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/internal/testrooturl"
)

var (
	// these are the credentials that the auth service's test endpoints accept:
	permCredentials = &tcclient.Credentials{
		ClientID:    "tester",
		AccessToken: "no-secret",
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
	t.Helper()
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

func testWithTempCreds(t *testing.T, test IntegrationTest, expectedStatusCode int, tempScopes ...string) {
	t.Helper()
	tempScopesBytes, err := json.Marshal(tempScopes)
	if err != nil {
		t.Fatal("Bug in test")
	}
	tempScopesJSON := string(tempScopesBytes)

	tempCredsClientID := "test:temp-cred-issuer"
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
	t.Helper()
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
	t.Helper()
	respBody, err := io.ReadAll(res.Body)
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
	test := func(useAuthorizedScopes bool, expectedHTTPStatusCode int) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
			t.Helper()
			// Test setup
			routes := NewRoutes(
				tcclient.Client{
					RootURL:     testrooturl.Get(t),
					Credentials: creds,
				},
			)
			if useAuthorizedScopes {
				routes.Credentials.AuthorizedScopes = []string{"test:authenticate-get"}
			}

			u := tcurls.API(testrooturl.Get(t), "auth", "v1", "test-authenticate-get")
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
				if httpError.HttpResponseCode != expectedHTTPStatusCode {
					t.Fatalf("Bad response code %d", httpError.HttpResponseCode)
				}
			}
			_, err = io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("Exception thrown:\n%s", err)
			}
			return res
		}
	}

	t.Run("perm creds, no authorized scopes",
		func(t *testing.T) { testWithPermCreds(t, test(false, 200), 303) })
	t.Run("temp creds with good scope, no authorized scopes",
		func(t *testing.T) { testWithTempCreds(t, test(false, 200), 303, "test:authenticate-get") })
	// not the required scope for the API method (InsufficientScopes)
	t.Run("temp creds with bad scope, no authorized scopes",
		func(t *testing.T) { testWithTempCreds(t, test(false, 403), 303, "test:some-other-scope") })
	t.Run("perm creds with authorized scopes",
		func(t *testing.T) { testWithPermCreds(t, test(true, 200), 303) })
	t.Run("temp creds with good scope, authorized scopes",
		func(t *testing.T) { testWithTempCreds(t, test(true, 200), 303, "test:authenticate-get") })
	// temp creds that don't satisfy authorizedScopes (invalid authentication)
	t.Run("temp creds with bad scope, authorized scopes",
		func(t *testing.T) { testWithTempCreds(t, test(true, 401), 303, "test:some-other-scope") })
}

func TestBewitArbitraryURL(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
		t.Helper()
		// Test setup
		routes := NewRoutes(
			tcclient.Client{
				RootURL:     testrooturl.Get(t),
				Credentials: creds,
			},
		)

		u := "https://tc.example.com/some/path?somekey=someval"
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
		parsed, err := url.Parse(bewitURLFromLocation)
		if err != nil {
			t.Fatalf("Bewit URL returned is invalid: %q", bewitURLFromLocation)
		}

		if parsed.Host != "tc.example.com" {
			t.Fatalf("Bewit endpoint rewrote URL host to %s", parsed.Host)
		}
		if parsed.Path != "/some/path" {
			t.Fatalf("Bewit endpoint rewrote URL path to %s", parsed.Path)
		}
		query := parsed.Query()
		if somekey, ok := query["somekey"]; !ok || somekey[0] != "someval" {
			t.Fatalf("Bewit endpoint did not preserve query params")
		}
		if _, ok := query["bewit"]; !ok {
			t.Fatalf("Bewit endpoint did not contain a bewit query param")
		}

		return res
	}

	// Since it's an arbtirary URL, all we can do is check that the endpoint succeeded..
	testWithPermCreds(t, test, 303)
}

func TestAPICallGET(t *testing.T) {
	test := func(scopes []string) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
			t.Helper()
			// Test setup
			routes := NewRoutes(
				tcclient.Client{
					Authenticate: true,
					RootURL:      testrooturl.Get(t),
					Credentials: &tcclient.Credentials{
						ClientID:    creds.ClientID,
						AccessToken: creds.AccessToken,
						Certificate: creds.Certificate,
					},
				},
			)
			if len(scopes) > 0 {
				routes.Credentials.AuthorizedScopes = scopes
			}

			// Requires scope "auth:azure-table:read-write:fakeaccount/DuMmYtAbLe"
			req, err := http.NewRequest(
				"GET", "http://localhost:60024/api/auth/v1/test-authenticate-get/",
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
	t.Run("Test with perm creds without authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{}), 200)
	})
	t.Run("Test with perm creds with authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{"test:authenticate-get"}), 200)
	})
	t.Run("Test with perm creds with wrong authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{"test:something-else"}), 403)
	})
	t.Run("Test with temp creds without authorizedScopes", func(t *testing.T) {
		testWithTempCreds(t, test([]string{}), 200, "test:authenticate-get")
	})
	t.Run("Test with temp creds with authorizedScopes", func(t *testing.T) {
		testWithTempCreds(t, test([]string{"test:authenticate-get"}), 200, "test:authenticate-get")
	})
}

func TestAPICallPOST(t *testing.T) {
	test := func(scopes []string, sendContentType bool) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
			t.Helper()

			// Test setup
			routes := NewRoutes(
				tcclient.Client{
					Authenticate: true,
					RootURL:      testrooturl.Get(t),
					Credentials: &tcclient.Credentials{
						ClientID:    creds.ClientID,
						AccessToken: creds.AccessToken,
						Certificate: creds.Certificate,
					},
				},
			)
			if len(scopes) > 0 {
				routes.Credentials.AuthorizedScopes = scopes
			}

			req, err := http.NewRequest(
				"POST",
				// note that we do not expect to have permissions to create this; 403 is success
				// TODO: ^^ not actually true as it doesn't check the body until auth is OK
				"http://localhost:60024/auth/v1/test-authenticate",
				bytes.NewBufferString(`{"clientScopes": ["test:*", "auth:create-client:test:*"], "requiredScopes": ["test:authenticate-post"]}`),
			)
			if sendContentType {
				req.Header["Content-Type"] = []string{"application/json"}
			}
			if err != nil {
				log.Fatal(err)
			}
			res := httptest.NewRecorder()

			// Function to test
			routes.RootHandler(res, req)
			return res
		}
	}

	t.Run("Test with perm creds without authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{}, true), 200)
	})
	t.Run("Test with perm creds without Content-Type header", func(t *testing.T) {
		testWithPermCreds(t, test([]string{}, false), 200)
	})
	t.Run("Test with perm creds with authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{"test:authenticate-post"}, true), 200)
	})
	t.Run("Test with perm creds with wrong authorizedScopes", func(t *testing.T) {
		testWithPermCreds(t, test([]string{"test:something-else"}, true), 403)
	})
	t.Run("Test with temp creds without authorizedScopes", func(t *testing.T) {
		testWithTempCreds(t, test([]string{}, true), 200, "test:authenticate-post")
	})
	t.Run("Test with temp creds with authorizedScopes", func(t *testing.T) {
		testWithTempCreds(t, test([]string{"test:authenticate-post"}, true), 200, "test:authenticate-post")
	})
}

func TestNon200HasErrorBody(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
		t.Helper()

		// Test setup
		routes := NewRoutes(
			tcclient.Client{
				RootURL:      testrooturl.Get(t),
				Authenticate: true,
				Credentials:  creds,
			},
		)
		taskID := slugid.Nice()

		req, err := http.NewRequest(
			"POST",
			"http://localhost:60024/queue/v1/task/"+taskID+"/schedule",
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
	t.Run("perm creds", func(t *testing.T) { testWithPermCreds(t, test, 404) })
	t.Run("temp creds", func(t *testing.T) { testWithTempCreds(t, test, 404) })
}

func TestOversteppedScopes(t *testing.T) {
	test := func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
		t.Helper()

		// Test setup
		routes := NewRoutes(
			tcclient.Client{
				RootURL:      testrooturl.Get(t),
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
				"X-Taskcluster-Endpoint":          tcurls.API(testrooturl.Get(t), "secrets", "v1", "secret/garbage/pmoore/foo"),
				"X-Taskcluster-Authorized-Scopes": `["secrets:get:garbage/pmoore/foo"]`,
			},
		)
		return res
	}
	testWithTempCreds(t, test, 401)
}

func TestBadCredsReturns500(t *testing.T) {
	routes := NewRoutes(
		tcclient.Client{
			RootURL:      testrooturl.Get(t),
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
		t.Helper()

		// Test setup
		routes := NewRoutes(
			tcclient.Client{
				RootURL:      testrooturl.Get(t),
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
	t.Run("temp creds", func(t *testing.T) { testWithTempCreds(t, test, 404) })
	t.Run("perm creds", func(t *testing.T) { testWithPermCreds(t, test, 404) })
}

func TestGetResponseBody(t *testing.T) {
	test := func(expectedClient string) IntegrationTest {
		return func(t *testing.T, creds *tcclient.Credentials) *httptest.ResponseRecorder {
			t.Helper()

			// Test setup
			routes := NewRoutes(
				tcclient.Client{
					RootURL:      testrooturl.Get(t),
					Authenticate: true,
					Credentials:  creds,
				},
			)

			req, err := http.NewRequest(
				"GET",
				"http://localhost:60024/auth/v1/test-authenticate-get/",
				nil,
			)
			if err != nil {
				log.Fatal(err)
			}
			res := httptest.NewRecorder()

			// Function to test
			routes.RootHandler(res, req)

			var body map[string]any
			err = json.Unmarshal(res.Body.Bytes(), &body)
			if err != nil {
				log.Fatal(err)
			}
			if body["clientId"].(string) != expectedClient {
				log.Fatalf("Got clientId %#v", body["clientId"])
			}
			return res
		}
	}

	t.Run("perm creds",
		func(t *testing.T) { testWithPermCreds(t, test("tester"), 200) })
	t.Run("temp creds",
		func(t *testing.T) { testWithTempCreds(t, test("test:temp-cred-issuer"), 200, "test:authenticate-get") })
}
