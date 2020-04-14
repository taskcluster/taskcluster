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

func TestWrongAccessToken(t *testing.T) {
	ts := StartServer(t, false)
	defer ts.Close()

	client := http.Client{}

	// write something to start the GET server..
	body := ioutil.NopCloser(strings.NewReader("hi"))
	req, err := http.NewRequest("PUT", fmt.Sprintf("http://127.0.0.1:%d/log", ts.PutPort()), body)
	require.NoError(t, err)
	res, err := client.Do(req)
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 201, res.StatusCode)

	// now contact the GET port with a bogus URL
	res, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/log/bad-access-token", ts.GetPort()))
	require.NoError(t, err)

	require.Equal(t, 401, res.StatusCode)
}
