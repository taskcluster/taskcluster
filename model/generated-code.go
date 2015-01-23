package model

import (
	"crypto/sha256"
	"fmt"
	hawk "github.com/tent/hawk-go"
	"io/ioutil"
	"log"
	"net/http"
)

type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
}

type ScopesResponse struct {
	ClientId    string
	AccessToken string
	Scopes      []string
	Expires     string
}

type GetCredentialsResponse struct {
	ClientId    string
	AccessToken string
	Scopes      []string
	Expires     string
	Name        string
	Description string
}

func (auth Auth) Scopes(clientId string) ScopesResponse {
	credentials := &hawk.Credentials{
		ID:   auth.ClientId,
		Key:  auth.AccessToken,
		Hash: sha256.New,
	}
	httpRequest, _ := http.NewRequest("GET", fmt.Sprintf("https://auth.taskcluster.net/v1/client/%v/scopes", auth.ClientId), nil)
	reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
	httpRequest.Header.Set("Authorization", reqAuth)
	httpClient := &http.Client{}
	response, err := httpClient.Do(httpRequest)
	if err != nil {
		log.Fatal(err)
	} else {
		defer response.Body.Close()
		contents, err := ioutil.ReadAll(response.Body)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s\n", string(contents))
	}
	return ScopesResponse{}
}

func (auth Auth) GetCredentials(clientId string) GetCredentialsResponse {
	return GetCredentialsResponse{}
}
