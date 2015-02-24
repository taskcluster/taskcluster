package main

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/auth"
)

func main() {
	authAPI := auth.Auth{}
	authAPI.Authenticate = false
	authAPI.BaseURL = "http://localhost:1234/api/AuthAPI/v1"
	client, _ := authAPI.ModifyClient("gjhvsdfvrnbvsdvfkjhvds", &auth.GetClientCredentialsResponse1{Description: "a nice client", Expires: "2016-06-07T13:23:55.213Z", Name: "pmoore_test", Scopes: []string{"*"}})
	fmt.Printf("Access Token: %v\n", client.AccessToken)
	fmt.Printf("Client Id:    %v\n", client.ClientId)
	fmt.Printf("Description:  %v\n", client.Description)
	fmt.Printf("Expires:      %v\n", client.Expires)
	fmt.Printf("Name:         %v\n", client.Name)
	fmt.Printf("Scopes:       %v\n", client.Scopes)
}
