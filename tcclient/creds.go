package tcclient

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
)

// The entry point into all the functionality in this package is to create a
// ConnectionData object. It contains authentication credentials, and a service
// endpoint, which are required for all HTTP operations.
type ConnectionData struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://auth.taskcluster.net/v1" for production.
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

type TemporaryCertificate struct {
	Certificate Certificate `json:"certificate"`
}

type Certificate struct {
	Version   int      `json:"version"`
	Scopes    []string `json:"scopes"`
	Start     int64    `json:"start"`
	Expiry    int64    `json:"expiry"`
	Seed      string   `json:"seed"`
	Signature string   `json:"signature"`
}

// CreateTemporaryCredentials generates temporary credentials from permanent
// credentials, valid for the given duration, starting immediately.  The
// temporary credentials' scopes must be a subset of the permanent credentials'
// scopes. The duration may not be more than 31 days.
//
// See http://docs.taskcluster.net/auth/temporary-credentials/
func (permaCreds *ConnectionData) CreateTemporaryCredentials(duration time.Duration, scopes []string) (tempCreds *ConnectionData, err error) {

	if duration > 31*24*time.Hour {
		return nil, errors.New("Temporary credentials must expire within 31 days; however a duration of " + duration.String() + " was specified to (*tcclient.ConnectionData).CreateTemporaryCredentials(...) method")
	}

	now := time.Now()
	start := now.Add(time.Minute * -5) // subtract 5 min for clock drift
	expiry := now.Add(duration)

	if permaCreds.ClientId == "" {
		return nil, errors.New("Temporary credentials cannot be created from credentials that have an empty ClientId")
	}
	if permaCreds.AccessToken == "" {
		return nil, errors.New("Temporary credentials cannot be created from credentials that have an empty AccessToken")
	}
	if permaCreds.Certificate != "" {
		return nil, errors.New("Temporary credentials cannot be created from temporary credentials, only from permanent credentials")
	}

	cert := Certificate{
		Version:   1,
		Scopes:    scopes,
		Start:     start.UnixNano() / 1e6,
		Expiry:    expiry.UnixNano() / 1e6,
		Seed:      slugid.V4() + slugid.V4(),
		Signature: "", // gets set in updateSignature() method below
	}

	cert.updateSignature(permaCreds.AccessToken)
	jsonCert, err := json.Marshal(cert)
	if err != nil {
		return
	}
	tempAccessToken, err := generateTemporaryAccessToken(permaCreds.AccessToken, cert.Seed)
	if err != nil {
		return
	}

	tempCreds = &ConnectionData{
		ClientId:     permaCreds.ClientId,
		AccessToken:  tempAccessToken,
		BaseURL:      permaCreds.BaseURL,
		Authenticate: permaCreds.Authenticate,
		Certificate:  string(jsonCert),
	}

	return
}

func (cert Certificate) updateSignature(accessToken string) (err error) {
	lines := []string{
		"version:" + strconv.Itoa(cert.Version),
		"seed:" + cert.Seed,
		"start:" + strconv.FormatInt(cert.Start, 10),
		"expiry:" + strconv.FormatInt(cert.Expiry, 10),
		"scopes:",
	}
	lines = append(lines, cert.Scopes...)
	hash := hmac.New(sha256.New, []byte(accessToken))
	_, err = hash.Write([]byte(strings.Join(lines, "\n")))
	if err != nil {
		return err
	}
	cert.Signature = base64.StdEncoding.EncodeToString(hash.Sum([]byte{}))
	return
}

func generateTemporaryAccessToken(permAccessToken, seed string) (tempAccessToken string, err error) {
	hash := hmac.New(sha256.New, []byte(permAccessToken))
	_, err = hash.Write([]byte(seed))
	if err != nil {
		return "", err
	}
	tempAccessToken = strings.TrimRight(base64.URLEncoding.EncodeToString(hash.Sum([]byte{})), "=")
	return
}
