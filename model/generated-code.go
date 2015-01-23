package model

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	hawk "github.com/tent/hawk-go"
	"log"
	"net/http"
)

type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
}

type ScopesResult struct {
	ClientId string
	Scopes   []string
	Expires  string
}

func (result ScopesResult) String() string {
	return fmt.Sprintf(
		"Client ID:    %v\n"+
			"Scopes:       %v\n"+
			"Expires:      %v\n",
		result.ClientId, result.AccessToken, result.Scopes, result.Expires)
}

type GetCredentialsResult struct {
	ClientId    string
	AccessToken string
	Scopes      []string
	Expires     string
}

func (auth Auth) Scopes(clientId string) ScopesResult {
	credentials := &hawk.Credentials{
		ID:   auth.ClientId,
		Key:  auth.AccessToken,
		Hash: sha256.New,
	}
	httpRequest, err := http.NewRequest("GET", fmt.Sprintf("https://auth.taskcluster.net/v1/client/%v/scopes", auth.ClientId), nil)
	if err != nil {
		log.Fatal(err)
	}
	reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
	httpRequest.Header.Set("Authorization", reqAuth)
	httpClient := &http.Client{}
	response, err := httpClient.Do(httpRequest)
	if err != nil {
		log.Fatal(err)
	}
	defer response.Body.Close()
	var scopes ScopesResult
	json := json.NewDecoder(response.Body)
	err = json.Decode(&scopes)
	if err != nil {
		log.Fatal(err)
	}
	return scopes
}

func (auth Auth) GetCredentials(clientId string) GetCredentialsResult {
	return GetCredentialsResult{}
}
