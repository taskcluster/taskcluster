package main

import (
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type ChunkReader struct {
	chunks    [][]byte
	chunk_num int
	partial   int
}

// read data in units of at most a chunk, somewhat slowly, to test the
// "streaming" capability of the server
func (c *ChunkReader) Read(p []byte) (n int, err error) {
	if c.chunk_num >= len(c.chunks) {
		err = io.EOF
		return
	}
	time.Sleep(50 * time.Microsecond)

	remaining := len(c.chunks[c.chunk_num]) - c.partial
	if remaining > len(p) {
		copy(p, c.chunks[c.chunk_num][c.partial:c.partial+len(p)])
		c.partial += len(p)
		n = len(p)
		return
	}

	copy(p, c.chunks[c.chunk_num][c.partial:])
	n = remaining
	c.partial = 0
	c.chunk_num += 1
	return
}

const TEXT = `Sed ut perspiciatis unde omnis iste natus error sit voluptatem
accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo
inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo
enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque
porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur,
adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et
dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis
nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex
ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea
voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem
eum fugiat quo voluptas nulla pariatur?`

func TestSequence(t *testing.T) {
	ts := StartServer(t, false)
	defer ts.Close()

	// generate some longish chunks
	var chunks [][]byte
	for i := 0; i < 10000; i++ {
		chunks = append(chunks, []byte(fmt.Sprintf("%d|%s\n", i, TEXT)))
	}

	client := http.Client{}

	// kick off the writer in the background..
	go func() {
		body := ioutil.NopCloser(&ChunkReader{chunks: chunks})
		req, err := http.NewRequest("PUT", fmt.Sprintf("http://127.0.0.1:%d/log", ts.PutPort()), body)
		if err != nil {
			panic(err)
		}
		res, err := client.Do(req)
		if err != nil {
			panic(err)
		}

		if res.StatusCode != 201 {
			panic(fmt.Sprintf("writer got %s", res.Status))
		}
	}()

	// contact the GET port (once it's available) and read until EOF
	res, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/log/7_3HoMEbQau1Qlzwx-JZgg", ts.GetPort()))
	require.NoError(t, err)

	log.Printf("%#v", res)
	require.Equal(t, 200, res.StatusCode)
	resBody, err := ioutil.ReadAll(res.Body)
	require.NoError(t, err)

	require.Equal(t, string(bytes.Join(chunks, []byte{})), string(resBody))
}
