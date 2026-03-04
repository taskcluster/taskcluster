package tcobject

import (
	"bytes"
	"errors"
	"io"
	"testing"

	"github.com/stretchr/testify/require"
)

type writeSeekingBuffer struct {
	bytes.Buffer
}

func (w *writeSeekingBuffer) Seek(offset int64, whence int) (pos int64, err error) {
	if whence != io.SeekStart || offset != 0 {
		err = errors.New("only seek(0, io.SeekStart) is supported")
		return
	}
	w.Buffer = bytes.Buffer{}
	return 0, nil
}

func TestHashingWriteSeekerOnce(t *testing.T) {
	inner := &writeSeekingBuffer{}
	h := newHashingWriteSeeker(inner)

	source := bytes.NewReader([]byte("fake content"))
	count, err := io.Copy(h, source)
	require.NoError(t, err)
	require.Equal(t, int64(12), count)
	require.Equal(t, []byte("fake content"), inner.Bytes())

	hashes, err := h.hashes()
	require.NoError(t, err)

	require.Equal(t, "98b1ae45059b004178a8eee0c1f6179dcea139c0fd8a69ee47a6f02d97af1f17", hashes["sha256"])
	require.Equal(t, "e0ea5ae6e392bb46d27eebabf5e7eb817d242505a960079cd9871559eaa94c613aff4034b709ea3cbd7747b304e7da5564083df50ea51f389cddcb942d2a4a09", hashes["sha512"])
}

func TestHashingWriteSeekerTwice(t *testing.T) {
	inner := &writeSeekingBuffer{}
	h := newHashingWriteSeeker(inner)

	source := bytes.NewReader([]byte("fake")) // truncated read
	_, err := io.Copy(h, source)
	require.NoError(t, err)

	n, err := h.Seek(0, io.SeekStart)
	require.NoError(t, err)
	require.Equal(t, int64(0), n)

	source = bytes.NewReader([]byte("fake content"))
	count, err := io.Copy(h, source)
	require.NoError(t, err)
	require.Equal(t, int64(12), count)
	require.Equal(t, []byte("fake content"), inner.Bytes())

	hashes, err := h.hashes()
	require.NoError(t, err)

	require.Equal(t, "98b1ae45059b004178a8eee0c1f6179dcea139c0fd8a69ee47a6f02d97af1f17", hashes["sha256"])
	require.Equal(t, "e0ea5ae6e392bb46d27eebabf5e7eb817d242505a960079cd9871559eaa94c613aff4034b709ea3cbd7747b304e7da5564083df50ea51f389cddcb942d2a4a09", hashes["sha512"])
}
