package tcobject

import (
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"

	"github.com/johncgriffin/overflow"
)

// A hashingWriteSeeker implements io.WriteSeeker and wraps another io.WriteSeeker, adding
// functionality to hash as the data is being read.  Seeking back to the beginning resets
// the hashing. Seeking anywhere else in the wrapped object is an error.
type hashingWriteSeeker struct {
	inner io.WriteSeeker
	// hashes for each supported algorithm
	sha256 hash.Hash
	sha512 hash.Hash
	// total number of bytes hashed; if this is not equal to content_length, then something
	// went terribly wrong.
	bytes int64
}

func newHashingWriteSeeker(inner io.WriteSeeker) *hashingWriteSeeker {
	return &hashingWriteSeeker{
		inner:  inner,
		sha256: sha256.New(),
		sha512: sha512.New(),
		bytes:  0,
	}
}

// Write implements the io.Writer interface
func (h *hashingWriteSeeker) Write(b []byte) (n int, err error) {
	n, err = h.inner.Write(b)
	if err != nil || n == 0 {
		return
	}

	// slice b down to just the buffer from which `Write` wrote data
	b = b[:n]

	// use the io.Writer interface for each of the hashers.  This interface's
	// Write method is documented to never return an error.  We also verify that
	// the write methods hash all of the given bytes, which appears to be the
	// case for the standard library's hashing functions.
	var hashedBytes int

	hashedBytes, _ = h.sha256.Write(b)
	if hashedBytes != n {
		err =
			fmt.Errorf("Sha256.Write consumed %v bytes, not the full buffer (%v)", hashedBytes, n)
	}

	hashedBytes, _ = h.sha512.Write(b)
	if hashedBytes != n {
		err = fmt.Errorf("Sha512.Write only consumed %v bytes, not the full buffer (%v)", hashedBytes, n)
	}

	h.bytes = overflow.Add64p(h.bytes, int64(n))
	return
}

// Seek implements the io.Seeker interface
func (h *hashingWriteSeeker) Seek(offset int64, whence int) (pos int64, err error) {
	if whence != io.SeekStart || offset != 0 {
		err = errors.New("only seek(0, io.SeekStart) is supported")
		return
	}
	pos, err = h.inner.Seek(offset, whence)
	if err != nil {
		return
	}

	// we have returned to the beginning of the file, so reset the hashes
	h.sha256.Reset()
	h.sha512.Reset()
	h.bytes = 0
	return
}

// Hashes returns the calculated hashes, in a shape appropriate for FinishUpload.  If the
// content length does not match the number of bytes hashed, something has gone wrong.
func (h *hashingWriteSeeker) hashes() (map[string]string, error) {
	return map[string]string{
		"sha256": hex.EncodeToString(h.sha256.Sum(nil)),
		"sha512": hex.EncodeToString(h.sha512.Sum(nil)),
	}, nil
}
