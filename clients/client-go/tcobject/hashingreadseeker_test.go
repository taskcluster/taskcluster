package tcobject

import (
	"bytes"
	"io"
	"io/ioutil"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHashingReadSeekerOnce(t *testing.T) {
	inner := bytes.NewReader([]byte("fake content"))

	h := newHashingReadSeeker(inner)

	content, err := ioutil.ReadAll(h)
	require.NoError(t, err)
	require.Equal(t, []byte("fake content"), content)

	hashes, err := h.hashes(12)
	require.NoError(t, err)

	require.Equal(t, "98b1ae45059b004178a8eee0c1f6179dcea139c0fd8a69ee47a6f02d97af1f17", hashes.Sha256)
	require.Equal(t, "e0ea5ae6e392bb46d27eebabf5e7eb817d242505a960079cd9871559eaa94c613aff4034b709ea3cbd7747b304e7da5564083df50ea51f389cddcb942d2a4a09", hashes.Sha512)
}

func TestHashingReadSeekerTwice(t *testing.T) {
	inner := bytes.NewReader([]byte("fake")) // truncated read

	h := newHashingReadSeeker(inner)

	content, err := ioutil.ReadAll(h)
	require.NoError(t, err)
	require.Equal(t, []byte("fake"), content)

	inner.Reset([]byte("fake content"))

	_, _ = h.Seek(0, io.SeekStart)
	content, err = ioutil.ReadAll(h)
	require.NoError(t, err)
	require.Equal(t, []byte("fake content"), content)

	hashes, err := h.hashes(12)
	require.NoError(t, err)

	require.Equal(t, "98b1ae45059b004178a8eee0c1f6179dcea139c0fd8a69ee47a6f02d97af1f17", hashes.Sha256)
	require.Equal(t, "e0ea5ae6e392bb46d27eebabf5e7eb817d242505a960079cd9871559eaa94c613aff4034b709ea3cbd7747b304e7da5564083df50ea51f389cddcb942d2a4a09", hashes.Sha512)
}

func TestHashingReadSeekerBadContentLength(t *testing.T) {
	inner := bytes.NewReader([]byte("fake")) // truncated read

	h := newHashingReadSeeker(inner)

	content, err := ioutil.ReadAll(h)
	require.NoError(t, err)
	require.Equal(t, []byte("fake"), content)

	_, err = h.hashes(12)
	require.Error(t, err)
}
