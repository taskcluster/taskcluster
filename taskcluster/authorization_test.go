package taskcluster_test

import (
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"io"
	"log"
	"net/http"
	"os"
	"testing"
)

func TestAuthorization(t *testing.T) {
	httpClient := &http.Client{}
	url := "http://queue.taskcluster.net/v1/task/xfoo/artifacts/fo"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Fatal("Failed to create request: %s", err)
	}

	req.Header.Add("Authorization", tc.Authorization(req))

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Fatal("Failed to issue request: %s", err)
	}

	io.Copy(os.Stdout, resp.Body)
	resp.Body.Close()
}

func TestAuthorizationDelegate(t *testing.T) {
	httpClient := &http.Client{}
	url := "http://queue.taskcluster.net/v1/task/xfoo/artifacts/fo"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Fatal("Failed to create request: %s", err)
	}

	scopes := make([]string, 1)
	scopes[0] = "noforyou"

	auth, _ := tc.AuthorizationDelegate(req, scopes)

	req.Header.Add("Authorization", auth)
	resp, err := httpClient.Do(req)
	if err != nil {
		log.Fatal("Failed to issue request: %s", err)
	}

	io.Copy(os.Stdout, resp.Body)
	resp.Body.Close()
}
