package gwconfig

import "testing"

func TestPreloadedCacheRejectsWindowsDeviceAliases(t *testing.T) {
	for _, path := range []string{`\\?\C:\downloads`, `\\.\C:\downloads`, `\??\C:\downloads`, `//?/C:/downloads`, `\\?\UNC\server\share\seed`} {
		c := &Config{DownloadsDir: `C:\downloads`, PreloadedDirectoryCaches: []PreloadedDirectoryCache{{"one", path}}}
		if err := c.ValidatePreloadedDirectoryCaches(); err == nil {
			t.Fatalf("accepted device seed %q", path)
		}
		c.DownloadsDir = path
		c.PreloadedDirectoryCaches[0].Location = `C:\seed`
		if err := c.ValidatePreloadedDirectoryCaches(); err == nil {
			t.Fatalf("accepted device storage %q", path)
		}
	}
}
