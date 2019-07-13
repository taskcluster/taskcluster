package iopipes

import (
	"io"
	"testing"

	assert "github.com/stretchr/testify/require"
)

func TestInfinitePipeCreation(t *testing.T) {
	assert := assert.New(t)

	r, w := InfinitePipe()
	assert.NotNil(r, "Pipe Reader should be created")
	assert.Implements((*io.ReadCloser)(nil), r)
	assert.NotNil(w, "Pipe Writer should be created")
	assert.Implements((*io.WriteCloser)(nil), w)
}

func TestInfinitePipeNormal(t *testing.T) {
	assert := assert.New(t)

	d := []byte("hello world.")

	r, w := InfinitePipe()

	i, err := w.Write(d)
	assert.Equal(len(d), i, "The entire string should be written")
	assert.NoError(err)

	out := make([]byte, 2*len(d))
	i, err = r.Read(out)
	assert.Equal(len(d), i, "The entire string should be read")
	assert.NoError(err, "Reading should not cause an error")

	assert.Equal(d, out[:i], "Output should match input")
}

func TestPipeClose(t *testing.T) {
	assert := assert.New(t)

	r, w := InfinitePipe()
	// We do it multiple times from both the reader and writer ends
	// to ensure that closing never fails.
	assert.NoError(w.Close(), "Closing should never cause an error")
	assert.NoError(w.Close(), "Closing should never cause an error")
	assert.NoError(r.Close(), "Closing should never cause an error")
	assert.NoError(r.Close(), "Closing should never cause an error")

	i, err := r.Read([]byte{})
	assert.Equal(0, i, "No data should be read")
	assert.EqualError(err, io.EOF.Error())
	assert.Equal(err, io.EOF)

	i, err = w.Write([]byte{})
	assert.Equal(0, i, "No data should be written")
	assert.EqualError(err, io.ErrClosedPipe.Error())
	assert.Equal(err, io.ErrClosedPipe)
}

func TestInfinitePipeReadFirst(t *testing.T) {
	assert := assert.New(t)

	d := []byte("hello world.")

	r, w := InfinitePipe()

	go func() {
		out := make([]byte, 2*len(d))
		i, err := r.Read(out)
		assert.Equal(len(d), i, "The entire string should be read")
		assert.NoError(err, "Reading should not cause an error")
		assert.Equal(d, out[:i], "Output should match input")
	}()

	go func() {
		i, err := w.Write(d)
		assert.Equal(len(d), i, "The entire string should be written")
		assert.NoError(err)
	}()
}
