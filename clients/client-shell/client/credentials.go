package client

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/tent/hawk-go"

	got "github.com/taskcluster/go-got"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
)

// Credentials for taskcluster and methods to sign requests.
type Credentials struct {
	ClientID         string   `json:"clientId"`
	AccessToken      string   `json:"accessToken"`
	Certificate      string   `json:"certificate"`
	AuthorizedScopes []string `json:"authorizedScopes"`
}

// PayloadHash creates payload hash calculator for given content-type
func PayloadHash(contentType string) hash.Hash {
	a := hawk.Auth{
		Credentials: hawk.Credentials{
			Hash: sha256.New,
		},
	}
	return a.PayloadHash(contentType)
}

type certificate struct {
	Version   int      `json:"version"`
	Scopes    []string `json:"scopes"`
	Start     int64    `json:"start"`
	Expiry    int64    `json:"expiry"`
	Seed      string   `json:"seed"`
	Signature string   `json:"signature"`
	Issuer    string   `json:"issuer,omitempty"`
}

type ext struct {
	Certificate      *certificate `json:"certificate,omitempty"`
	AuthorizedScopes *[]string    `json:"authorizedScopes,omitempty"`
}

func nonce() string {
	b := make([]byte, 8)
	_, err := io.ReadFull(rand.Reader, b)
	if err != nil {
		panic(err)
	}
	return base64.StdEncoding.EncodeToString(b)[:8]
}

func (c *Credentials) newAuth(method, url string, h hash.Hash) (*hawk.Auth, error) {
	// Create a hawk auth
	a, err := hawk.NewURLAuth(url, &hawk.Credentials{
		ID:   c.ClientID,
		Key:  c.AccessToken,
		Hash: sha256.New,
	}, 0)
	if err != nil {
		return nil, err
	}
	a.Method = method

	// Add ext, if needed
	var e ext
	if c.Certificate != "" {
		err = json.Unmarshal([]byte(c.Certificate), &e.Certificate)
		if err != nil {
			return nil, fmt.Errorf("failed to parse certificate, error: %s", err)
		}
	}
	if len(c.AuthorizedScopes) > 0 {
		e.AuthorizedScopes = &c.AuthorizedScopes
	}
	if e.Certificate != nil || e.AuthorizedScopes != nil {
		s, _ := json.Marshal(e)
		a.Ext = base64.StdEncoding.EncodeToString(s)
	}

	// Set payload hash
	if h != nil {
		a.SetHash(h)
	}

	return a, nil
}

// SignHeader generates a request signature for Authorization
func (c *Credentials) SignHeader(method, url string, h hash.Hash) (string, error) {
	a, err := c.newAuth(strings.ToUpper(method), url, h)
	if err != nil {
		return "", err
	}
	a.Nonce = nonce()
	return a.RequestHeader(), nil
}

// SignURL will generate a (bewit) signed URL
func (c *Credentials) SignURL(URL string) (string, error) {
	a, err := c.newAuth("GET", URL, nil)
	if err != nil {
		return "", err
	}
	URL += "?bewit=" + url.QueryEscape(a.Bewit())
	return URL, nil
}

// SignRequest will add an Authorization header
func (c *Credentials) SignRequest(req *http.Request, hash hash.Hash) error {
	s, err := c.SignHeader(req.Method, req.URL.String(), hash)
	req.Header.Set("Authorization", s)
	return err
}

// SignGotRequest will add an Authorization header
func (c *Credentials) SignGotRequest(req *got.Request, hash hash.Hash) error {
	s, err := c.SignHeader(req.Method, req.URL, hash)
	req.Header.Set("Authorization", s)
	return err
}

// ToClientCredentials generates a credentials object that tcclient expects.
func (c *Credentials) ToClientCredentials() *tcclient.Credentials {
	return &tcclient.Credentials{
		ClientID:         c.ClientID,
		AccessToken:      c.AccessToken,
		Certificate:      c.Certificate,
		AuthorizedScopes: c.AuthorizedScopes,
	}
}
