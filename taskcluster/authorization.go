package taskcluster

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"net/http"
	"os"
)

type delegationOptions struct {
	Delegating bool     `json:"delegating"`
	Scopes     []string `json:"scopes"`
}

func getAuth(http *http.Request) *hawk.Auth {
	clientId := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")

	// Create the hawk authentication string from the request...
	credentials := &hawk.Credentials{
		ID:   clientId,
		Key:  accessToken,
		Hash: sha256.New,
	}
	return hawk.NewRequestAuth(http, credentials, 0)
}

func Authorization(http *http.Request) string {
	auth := getAuth(http)
	return auth.RequestHeader()
}

func AuthorizationDelegate(http *http.Request, scopes []string) (string, error) {
	delgating := delegationOptions{true, scopes}
	delgatingJson, err := json.Marshal(delgating)
	if err != nil {
		return "", err
	}

	delgatingJsonBase64 := base64.StdEncoding.EncodeToString(delgatingJson)
	if err != nil {
		return "", err
	}

	auth := getAuth(http)
	auth.Ext = delgatingJsonBase64
	return auth.RequestHeader(), nil
}
