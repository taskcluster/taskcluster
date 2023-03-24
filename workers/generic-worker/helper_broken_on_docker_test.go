//go:build !docker

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v48/clients/client-go"
	"github.com/taskcluster/taskcluster/v48/clients/client-go/tcqueue"
)

func checkSHA256(t *testing.T, sha256Hex string, file string) {
	hasher := sha256.New()
	f, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := io.Copy(hasher, f); err != nil {
		t.Fatal(err)
	}
	if actualSHA256Hex := hex.EncodeToString(hasher.Sum(nil)); actualSHA256Hex != sha256Hex {
		t.Errorf("Expected file %v to have SHA256 %v but it was %v", file, sha256Hex, actualSHA256Hex)
	}
}

func CancelTask(t *testing.T) (td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	// resolvetask is a go binary; source is in resolvetask subdirectory, binary is built in CI
	// but if running test manually, you may need to explicitly build it first.
	command := singleCommandNoArgs("resolvetask")
	payload = GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 300,
	}
	defaults.SetDefaults(&payload)
	fullCreds := config.Credentials()
	td = testTask(t)
	tempCreds, err := fullCreds.CreateNamedTemporaryCredentials("project/taskcluster:generic-worker-tester/"+t.Name(), time.Minute, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/*")
	if err != nil {
		t.Fatalf("%v", err)
	}
	payload.Env = map[string]string{
		"TASKCLUSTER_CLIENT_ID":    tempCreds.ClientID,
		"TASKCLUSTER_ACCESS_TOKEN": tempCreds.AccessToken,
		"TASKCLUSTER_CERTIFICATE":  tempCreds.Certificate,
		"TASKCLUSTER_ROOT_URL":     config.RootURL,
	}
	for _, envVar := range []string{
		"PATH",
		"GOPATH",
		"GOROOT",
	} {
		if v, exists := os.LookupEnv(envVar); exists {
			payload.Env[envVar] = v
		}
	}
	return
}

type ArtifactTraits struct {
	Extracts        []string
	ContentType     string
	ContentEncoding string
	Expires         tcclient.Time
}

type ExpectedArtifacts map[string]ArtifactTraits

func (expectedArtifacts ExpectedArtifacts) Validate(t *testing.T, taskID string, run int) {

	queue := serviceFactory.Queue(nil, config.RootURL)
	artifacts, err := queue.ListArtifacts(taskID, strconv.Itoa(run), "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	// Artifacts we find that we were not expecting, mapped by artifact name. Initially set to all artifacts
	// found, and then later remove all of the ones we were expecting.
	unexpectedArtifacts := make(map[string]tcqueue.Artifact, len(artifacts.Artifacts))

	for _, actualArtifact := range artifacts.Artifacts {
		unexpectedArtifacts[actualArtifact.Name] = actualArtifact
	}

	for artifactName, expected := range expectedArtifacts {
		if _, ok := unexpectedArtifacts[artifactName]; !ok {
			t.Errorf("Artifact '%s' not created", artifactName)
			continue
		}
		actual := unexpectedArtifacts[artifactName]
		// link artifacts do not have content types
		if actual.StorageType != "link" {
			if actual.ContentType != expected.ContentType {
				t.Errorf("Artifact %s should have mime type '%v' but has '%s'", artifactName, expected.ContentType, actual.ContentType)
			}
		}
		if !time.Time(expected.Expires).IsZero() {
			if actual.Expires.String() != expected.Expires.String() {
				t.Errorf("Artifact %s should have expiry '%s' but has '%s'", artifactName, expected.Expires, actual.Expires)
			}
		}
		b, rawResp, resp, url := getArtifactContentWithResponses(t, taskID, artifactName)
		defer resp.Body.Close()
		for _, requiredSubstring := range expected.Extracts {
			if !strings.Contains(string(b), requiredSubstring) {
				t.Errorf("Artifact '%s': Could not find substring %q in '%s'", artifactName, requiredSubstring, string(b))
			}
		}
		if actualContentEncoding := rawResp.Header.Get("Content-Encoding"); actualContentEncoding != expected.ContentEncoding {
			t.Errorf("Expected Content-Encoding %q but got Content-Encoding %q for artifact %q from url %v", expected.ContentEncoding, actualContentEncoding, artifactName, url)
		}
		if actualContentType := resp.Header.Get("Content-Type"); actualContentType != expected.ContentType {
			t.Errorf("Content-Type in Signed URL %v response (%v) does not match Content-Type of artifact (%v)", url, actualContentType, expected.ContentType)
		}
		delete(unexpectedArtifacts, artifactName) // artifact expected, so remove from unexpected artifacts map
	}

	if len(unexpectedArtifacts) > 0 {
		t.Errorf("%v unexpected aritfacts found: %#v", len(unexpectedArtifacts), unexpectedArtifacts)
	}
}

// getArtifactContentWithResponses downloads the given artifact, failing the
// test if this is not possible.  It returns responses for both a "raw" fetch
// (without compression) and a fetch potentially automatically decoding any
// content-encoding.  This only works for S3 artifacts, and is only used to
// test content-encoding.
func getArtifactContentWithResponses(t *testing.T, taskID string, artifact string) ([]byte, *http.Response, *http.Response, *url.URL) {
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	url, err := queue.GetLatestArtifact_SignedURL(taskID, artifact, 10*time.Minute)
	if err != nil {
		t.Fatalf("Error trying to fetch artifacts from Amazon...\n%s", err)
	}
	t.Logf("Getting from url %v", url.String())
	// need to do this so Content-Encoding header isn't swallowed by Go for test later on
	tr := &http.Transport{
		DisableCompression: true,
	}
	client := &http.Client{Transport: tr}
	rawResp, _, err := httpbackoff.ClientGet(client, url.String())
	if err != nil {
		t.Fatalf("Error trying to fetch decompressed artifact from signed URL %s ...\n%s", url.String(), err)
	}
	resp, _, err := httpbackoff.Get(url.String())
	if err != nil {
		t.Fatalf("Error trying to fetch artifact from signed URL %s ...\n%s", url.String(), err)
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Error trying to read response body of artifact from signed URL %s ...\n%s", url.String(), err)
	}
	return b, rawResp, resp, url
}

// getArtifactContent downloads the given artifact's content,
// failing the test if this is not possible.
func getArtifactContent(t *testing.T, taskID string, artifact string) []byte {
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	buf, _, _, err := queue.DownloadArtifactToBuf(taskID, -1, artifact)
	if err != nil {
		t.Fatalf("Error trying to fetch artifact:\n%e", err)
	}
	return buf
}
