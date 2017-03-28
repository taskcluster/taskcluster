package status

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/taskcluster/taskcluster-cli/cmds/root"

	"github.com/shibukawa/configdir"
	"github.com/spf13/cobra"
)

const (
	manifestURL = "https://references.taskcluster.net/manifest.json"
)

var (
	pingURLs          PingURLs
	validArgs         []string
	cache             = Cache()
	pingURLsCachePath = filepath.Join("cmds", "status", "pingURLs.json")
)

type (
	PingURLs map[string]string

	CachedURLs struct {
		LastUpdated time.Time `json:"lastUpdated"`
		PingURLs    PingURLs  `json:"pingURLs"`
	}

	PingResponse struct {
		Alive  bool    `json:"alive"`
		Uptime float64 `json:"uptime"`
	}

	API struct {
		BaseURL string     `json:"baseUrl"`
		Entries []APIEntry `json:"entries"`
	}

	APIEntry struct {
		Name  string `json:"name"`
		Route string `json:"route"`
	}
)

// CacheFilePath returns the file system path to the cache file storing the ping URLs
func Cache() (cache *configdir.Config) {
	configDirs := configdir.New("taskcluster", "taskcluster-cli")
	cache = configDirs.QueryCacheFolder()
	return
}

func init() {
	var err error
	pingURLs, err = NewPingURLs()
	if err != nil {
		panic(err)
	}

	validArgs = make([]string, len(pingURLs))
	i := 0
	for k := range pingURLs {
		validArgs[i] = k
		i++
	}
	use := "status"
	for _, validArg := range validArgs {
		use = use + " [" + validArg + "]"
	}
	statusCmd := &cobra.Command{
		Short: "status queries the current running status of taskcluster services",
		Long: `When called without arguments, taskcluster status will return the current running
status of all production taskcluster services.

By specifying one or more optional services as arguments, you can limit the
services included in the status report.`,
		PreRunE:            preRun,
		Use:                use,
		ValidArgs:          validArgs,
		RunE:               status,
		DisableFlagParsing: true,
	}

	// Add the task subtree to the root.
	root.Command.AddCommand(statusCmd)
}

// NewPingURLs returns the ping URLs to use. The caller does not need to be
// concerned about whether these URLs are retrieved from a local cache, or from
// querying web services.
func NewPingURLs() (pingURLs PingURLs, err error) {
	if !cache.Exists(pingURLsCachePath) {
		return RefreshCache(manifestURL, cache, pingURLsCachePath)
	}
	cachedURLs, err := ReadCachedURLsFile(cache, pingURLsCachePath)
	if err != nil {
		return
	}
	if cachedURLs.Expired(time.Hour * 24) {
		return RefreshCache(manifestURL, cache, pingURLsCachePath)
	}
	pingURLs = cachedURLs.PingURLs
	return
}

// RefreshCache will scrape the manifest url for a dictionary of taskcluster
// services, and cache the results in file at path.
func RefreshCache(manifestURL string, cache *configdir.Config, cachePath string) (pingURLs PingURLs, err error) {
	pingURLs, err = ScrapePingURLs(manifestURL)
	if err != nil {
		return
	}
	cachedURLs, err := pingURLs.Cache(cache, cachePath)
	return cachedURLs.PingURLs, err
}

// ReadCachedURLsFile returns a *CachedURLs based on the contents of the file
// with the given path.
func ReadCachedURLsFile(cache *configdir.Config, cachePath string) (cachedURLs *CachedURLs, err error) {
	var cachedURLsBytes []byte
	cachedURLsBytes, err = cache.ReadFile(cachePath)
	if err != nil {
		return
	}
	err = json.Unmarshal(cachedURLsBytes, &cachedURLs)
	return
}

// Cache writes the pingURLs p to a file at path (replacing if it exists
// already, and creating parent folders, if required), using the current time
// for the retrieval timestamp.
func (p PingURLs) Cache(cache *configdir.Config, cachePath string) (cachedURLs *CachedURLs, err error) {
	color.Magenta("Writing cache file %v", filepath.Join(cache.Path, cachePath))

	///////////////////////////////////////////////////////////////////////
	// workaround until https://github.com/shibukawa/configdir/pull/3 lands
	parentDir := filepath.Dir(filepath.Join(cache.Path, cachePath))
	err = os.MkdirAll(parentDir, 0755)
	if err != nil {
		return
	}
	///////////////////////////////////////////////////////////////////////

	cachedURLs = &CachedURLs{
		LastUpdated: time.Now(),
		PingURLs:    p,
	}
	var bytes []byte
	bytes, err = json.MarshalIndent(cachedURLs, "", "  ")
	if err != nil {
		return
	}
	err = cache.WriteFile(cachePath, bytes)
	return
}

func (cachedURLs *CachedURLs) Expired(d time.Duration) bool {
	return time.Since(cachedURLs.LastUpdated) > d
}

func preRun(cmd *cobra.Command, args []string) error {
	return validateArgs(cmd, args)
}

//  ScrapePingURLs queries manifestURL to return a manifest of services, which
//  are then queried to fetch ping URLs for taskcluster services
func ScrapePingURLs(manifestURL string) (pingURLs PingURLs, err error) {
	color.Yellow("Scraping ping URLs from %v", manifestURL)
	var allAPIs map[string]string
	err = objectFromJsonURL(manifestURL, &allAPIs)
	if err != nil {
		return
	}
	pingURLs = map[string]string{}
	for _, apiURL := range allAPIs {
		reference := new(API)
		err = objectFromJsonURL(apiURL, reference)
		if err != nil {
			return
		}

		// loop through entries to find a /ping endpoint
		for _, entry := range reference.Entries {
			if entry.Name == "ping" {
				// determine hostname
				var u *url.URL
				u, err = url.Parse(reference.BaseURL)
				if err != nil {
					return
				}
				hostname := u.Hostname()
				service := strings.SplitN(hostname, ".", 2)[0]
				pingURLs[service] = reference.BaseURL + entry.Route
				break
			}
		}
	}
	return
}

func objectFromJsonURL(urlReturningJSON string, object interface{}) (err error) {
	resp, err := http.Get(urlReturningJSON)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("Bad (!= 200) status code %v from (*URL) Hostnamerl %v", resp.StatusCode, urlReturningJSON)
	}
	decoder := json.NewDecoder(resp.Body)
	err = decoder.Decode(&object)
	if err != nil {
		return err
	}
	return nil
}

func validateArgs(cmd *cobra.Command, args []string) error {
outer:
	for _, arg := range args {
		for _, validArg := range cmd.ValidArgs {
			if arg == validArg {
				continue outer
			}
		}
		return fmt.Errorf("invalid argument(s) passed")
	}
	return nil
}

func respbody(service string) error {
	var servstat PingResponse
	err := objectFromJsonURL(pingURLs[service], &servstat)
	if err != nil {
		return err
	}
	if servstat.Alive == true {
		living := "Alive"
		fmt.Printf("      %v\n", service)
		color.Green("      %v\n", living)
	}

	return nil
}

func status(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		args = validArgs
	}
	for _, service := range args {
		err := respbody(service)
		if err != nil {
			panic(err)
		}
	}
	return nil
}
