package perms

import (
	"io/ioutil"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
)

func TestPermsGood(t *testing.T) {
	defer filet.CleanUp(t)

	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "test")
	require.NoError(t, ioutil.WriteFile(filename, []byte("hi"), 0644))
	makePermsBad(t, filename)

	err := MakePrivateToOwner(filename)
	require.NoError(t, err)

	err = VerifyPrivateToOwner(filename)
	require.NoError(t, err)
}

func TestPermsBad(t *testing.T) {
	defer filet.CleanUp(t)

	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "test")
	require.NoError(t, ioutil.WriteFile(filename, []byte("hi"), 0644))
	makePermsBad(t, filename)

	err := VerifyPrivateToOwner(filename)
	require.Error(t, err)
}
