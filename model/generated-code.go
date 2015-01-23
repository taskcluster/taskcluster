package model

type Auth struct {
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
	return ScopesResponse{}
}

func (auth Auth) GetCredentials(clientId string) GetCredentialsResponse {
	return GetCredentialsResponse{}
}
