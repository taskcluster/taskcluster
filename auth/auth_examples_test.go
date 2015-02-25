package auth

import (
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/auth"
	"io/ioutil"
)

func Example_scopes() {

	// authenticating against production with a client ID and access token

	auth := auth.New("hhskdjg476fau1ie1b29tQ", "3W_Lrghkjsdfn467834kgf0SRnKRiWSaKF9urnwGaX5Q")
	scopes, _ := auth.Scopes("hdjskhfb4nvrh673g4mvfd")
	fmt.Printf("Client ID: %v\n", scopes.ClientId)
	fmt.Printf("Expires:   %v\n", scopes.Expires)
	fmt.Printf("Scopes:    %v\n", scopes.Scopes)
}

func Example_modifyClient() {

	// running against a local task cluster instance with
	// authentication disabled, or a task cluster proxy

	auth := auth.Auth{Authenticate: false, BaseURL: "http://localhost:1234/api/AuthAPI/v1"}
	client, httpResp := auth.ModifyClient("gjhvsdfvrnbvsdvfkjhvds", &auth.GetClientCredentialsResponse1{Description: "a nice client", Expires: "2016-06-07T13:23:55.213Z", Name: "pmoore_test", Scopes: []string{"*"}})
	fmt.Printf("Access Token: %v\n", client.AccessToken)
	fmt.Printf("Client Id:    %v\n", client.ClientId)
	fmt.Printf("Description:  %v\n", client.Description)
	fmt.Printf("Expires:      %v\n", client.Expires)
	fmt.Printf("Name:         %v\n", client.Name)
	fmt.Printf("Scopes:       %v\n", client.Scopes)

	// if we want, we can also show the raw json that was returned...
	respBody, err := ioutil.ReadAll(httpResp.Body)
	if err != nil {
		fmt.Println("")
		fmt.Println("HTTP response payload was:")
		fmt.Println(respBody)
	} else {
		fmt.Println("Not able to read http response body")
		panic(err)
	}
}
