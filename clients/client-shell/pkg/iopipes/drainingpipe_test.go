package iopipes

import (
	"io"
	"testing"

	assert "github.com/stretchr/testify/require"
)

func TestDrainingPipeCreation(t *testing.T) {
	assert := assert.New(t)

	r, w := DrainingPipe(0, nil)
	assert.NotNil(r, "Pipe Reader should be created")
	assert.Implements((*io.ReadCloser)(nil), r)
	assert.NotNil(w, "Pipe Writer should be created")
	assert.Implements((*io.WriteCloser)(nil), w)
}

func TestDrainingPipeNormal(t *testing.T) {
	assert := assert.New(t)

	d := []byte("hello world.")

	r, w := DrainingPipe(2*len(d), nil)

	i, err := w.Write(d)
	assert.Equal(len(d), i, "The entire string should be written")
	assert.NoError(err)

	out := make([]byte, 2*len(d))
	i, err = r.Read(out)
	assert.Equal(len(d), i, "The entire string should be read")
	assert.NoError(err, "Reading should not cause an error")

	assert.Equal(d, out[:i], "Output should match input")
}

func TestDrainingPipeClose(t *testing.T) {
	assert := assert.New(t)

	r, w := DrainingPipe(0, nil)
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

func TestDrainingPipeDrain(t *testing.T) {
	assert := assert.New(t)

	d := []byte("hello test")
	expected := append(d, '.')

	r, w := DrainingPipe(0, nil)

	i, err := w.Write(d)
	assert.Equal(len(d), i, "The entire string should be written")
	assert.EqualError(err, ErrPipeFull.Error())

	// Subsequent writes should pass with an error.
	i, err = w.Write([]byte{'.'})
	assert.Equal(1, i, "The entire string should be written")
	assert.EqualError(err, ErrPipeFull.Error())

	out := make([]byte, len(d)*2)
	i, err = r.Read(out)
	assert.Equal(len(expected), i, "The entire string should be read")
	assert.NoError(err, "Reading should not cause an error")
	assert.Equal(expected, out[:i], "Output should match input")
}

func TestDrainingPipeReadFirst(t *testing.T) {
	assert := assert.New(t)

	d := []byte("hello world.")

	r, w := DrainingPipe(2*len(d), nil)

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

func TestDrainingPipeCloseChan(t *testing.T) {
	assert := assert.New(t)

	c := make(chan bool)
	r, w := DrainingPipe(0, c)
	assert.NoError(w.Close(), "Closing should never cause an error")

	i, err := r.Read([]byte{})
	assert.Equal(0, i, "No data should be read")
	assert.Error(err)

	_, ok := <-c
	assert.False(ok, "Channel should be closed")
}

func TestDrainingPipeDrainChan(t *testing.T) {
	assert := assert.New(t)

	c := make(chan bool)
	quit := make(chan bool)

	d := []byte("hello test")

	r, w := DrainingPipe(0, c)

	i, err := w.Write(d)
	assert.Equal(len(d), i, "The entire string should be written")
	assert.Error(err)

	go func() {
		select {
		case b := <-c:
			assert.True(b)
			close(quit)
			return
		case <-quit:
			assert.Fail("Channel was not notified of draining completion")
			return
		}
	}()

	out := make([]byte, len(d)*2)
	i, err = r.Read(out)
	assert.Equal(len(d), i, "The entire string should be read")
	assert.NoError(err, "Reading should not cause an error")
	assert.Equal(d, out[:i], "Output should match input")

	_, ok := <-quit
	if ok {
		close(quit)
	}
}
