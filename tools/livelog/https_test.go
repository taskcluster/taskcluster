package main

import (
	"crypto/tls"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Note that this does not check that the cert is valid (it's not..)
func TestWithTls(t *testing.T) {
	ts := StartServer(t, true)
	defer ts.Close()

	logContents := "not\na\nvery\nlong\nlog"

	// first write until EOF
	putClient := &http.Client{}
	body := ioutil.NopCloser(strings.NewReader(logContents))
	req, err := http.NewRequest("PUT", fmt.Sprintf("http://127.0.0.1:%d/log", ts.PutPort()), body)
	require.NoError(t, err)
	res, err := putClient.Do(req)
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 201, res.StatusCode)

	// now contact the GET port and read until EOF
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
	}
	transport := &http.Transport{TLSClientConfig: tlsConfig}
	getClient := &http.Client{Transport: transport}

	res, err = getClient.Get(fmt.Sprintf("https://localhost:%d/log/7_3HoMEbQau1Qlzwx-JZgg", ts.GetPort()))
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 200, res.StatusCode)
	resBody, err := ioutil.ReadAll(res.Body)
	require.NoError(t, err)

	require.Equal(t, logContents, string(resBody))
}
