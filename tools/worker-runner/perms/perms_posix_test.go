//go:build linux || darwin || freebsd

package perms

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func makePermsBad(t *testing.T, filename string) {
	require.NoError(t, os.Chmod(filename, 0666))
}
