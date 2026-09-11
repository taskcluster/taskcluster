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

func TestMakeFilePrivate(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	t.Run("AlreadyPrivate", func(t *testing.T) {
		filename := filepath.Join(dir, "already-private")
		require.NoError(t, WritePrivateFile(filename, []byte("secret")))
		wasLoose, err := MakeFilePrivate(filename)
		require.NoError(t, err)
		require.False(t, wasLoose, "expected no fix needed when file is already private")
		// still readable as a private file
		content, err := ReadPrivateFile(filename)
		require.NoError(t, err)
		require.Equal(t, []byte("secret"), content)
	})

	t.Run("LoosePerms", func(t *testing.T) {
		filename := filepath.Join(dir, "loose")
		require.NoError(t, WritePrivateFile(filename, []byte("secret")))
		makePermsBad(t, filename)
		wasLoose, err := MakeFilePrivate(filename)
		require.NoError(t, err)
		require.True(t, wasLoose, "expected fix to be reported when file had loose perms")
		// file is now private and readable via ReadPrivateFile
		content, err := ReadPrivateFile(filename)
		require.NoError(t, err)
		require.Equal(t, []byte("secret"), content)
	})

	t.Run("NonExistent", func(t *testing.T) {
		filename := filepath.Join(dir, "does-not-exist")
		_, err := MakeFilePrivate(filename)
		require.Error(t, err)
		require.True(t, os.IsNotExist(err))
	})
}
