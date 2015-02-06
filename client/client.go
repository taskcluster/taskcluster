package client

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	hawk "github.com/tent/hawk-go"
	"net/http"
)

type HttpMethod int

const (
	OPTIONS HttpMethod = iota
	GET
	HEAD
	POST
	PUT
	DELETE
	TRACE
	CONNECT
)

//go:generate generatemodel -f ../model/apis.json -o generated-code.go -m model-data.txt

type (
	Auth struct {
		// Client ID required by Hawk
		ClientId string
		// Access Token required by Hawk
		AccessToken string
	}
)

func (auth *Auth) apiCall(inputArgs []string, payload interface{}, method HttpMethod, route string, result interface{}) interface{} {
	credentials := &hawk.Credentials{
		ID:   auth.ClientId,
		Key:  auth.AccessToken,
		Hash: sha256.New,
	}
	httpRequest, err := http.NewRequest("GET", fmt.Sprintf("https://auth.taskcluster.net/v1/client/%v/scopes", auth.ClientId), nil)
	if err != nil {
		panic(err)
	}
	reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
	httpRequest.Header.Set("Authorization", reqAuth)
	httpClient := &http.Client{}
	response, err := httpClient.Do(httpRequest)
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	var scopes interface{}
	json := json.NewDecoder(response.Body)
	err = json.Decode(&scopes)
	if err != nil {
		panic(err)
	}
	return scopes
}
