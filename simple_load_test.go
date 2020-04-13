package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteThenReadToEof(t *testing.T) {
	ts := StartServer(t, false)
	defer ts.Close()

	logContents := "not\na\nvery\nlong\nlog"

	client := http.Client{}

	// first write until EOF
	body := ioutil.NopCloser(strings.NewReader(logContents))
	req, err := http.NewRequest("PUT", fmt.Sprintf("http://127.0.0.1:%d/log", ts.PutPort()), body)
	require.NoError(t, err)
	res, err := client.Do(req)
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 201, res.StatusCode)

	// now contact the GET port and read until EOF
	res, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/log/7_3HoMEbQau1Qlzwx-JZgg", ts.GetPort()))
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 200, res.StatusCode)
	resBody, err := ioutil.ReadAll(res.Body)
	require.NoError(t, err)

	require.Equal(t, logContents, string(resBody))
}
