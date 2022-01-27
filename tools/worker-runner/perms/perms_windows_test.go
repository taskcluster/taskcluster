//go:build windows

package perms

import (
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/sys/windows"
)

func makePermsBad(t *testing.T, filename string) {
	// allow access to anonymous.. that seems bad..
	si, err := windows.SecurityDescriptorFromString("D:PAI(A;;FA;;;OW)(A;;FA;;;AN)")
	require.NoError(t, err)

	dacl, _, err := si.DACL()
	require.NoError(t, err)

	// use all of that to set the owner, group, and dacl for the file.
	require.NoError(t, windows.SetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION,
		nil,
		nil,
		dacl,
		nil))
}
