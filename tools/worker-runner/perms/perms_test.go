package perms

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
)

func TestPerms(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	t.Run("Good", func(t *testing.T) {
		filename := filepath.Join(dir, "good")
		require.NoError(t, WritePrivateFile(filename, []byte("hi")))
		content, err := ReadPrivateFile(filename)
		require.NoError(t, err)
		require.Equal(t, []byte("hi"), content)
	})

	t.Run("Bad", func(t *testing.T) {
		filename := filepath.Join(dir, "bad")
		require.NoError(t, WritePrivateFile(filename, []byte("hi")))
		makePermsBad(t, filename)
		content, err := ReadPrivateFile(filename)
		require.Error(t, err)
		require.Equal(t, []byte{}, content)
	})

	t.Run("ReadNonexistent", func(t *testing.T) {
		filename := filepath.Join(dir, "gone")
		content, err := ReadPrivateFile(filename)
		require.Error(t, err)
		require.Equal(t, []byte{}, content)
		require.True(t, os.IsNotExist(err))
	})
}
