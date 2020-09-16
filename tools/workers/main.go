package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"

	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcworkermanager"
)

type (
	// WorkerPools is a mapping from worker pool name to its definition
	WorkerPools map[string]tcworkermanager.WorkerPoolFullDefinition
)

func ExitOnError(err error) {
	if err != nil {
		log.Fatalf("%v", err)
	}
}

func ConfigureLogging() {
	// Errors should be prefixed by the name of the executable, and no
	// timestamps etc
	log.SetFlags(0)
	log.SetPrefix(filepath.Base(os.Args[0]) + ": ")
}

// ImageSetDirs returns a directory listing of the community-tc/imagesets
// directory inside the password store
func ImageSetDirs() ([]os.FileInfo, error) {
	// Check `pass` is installed and configured, and that imagesets directory
	// exists. Note: it is the users responsibility to `pass git pull`.
	passwordStoreDir := os.Getenv("PASSWORD_STORE_DIR")
	if passwordStoreDir == "" {
		passwordStoreDir = filepath.Join(os.Getenv("HOME"), ".password-store")
	}
	imageSetsDir := filepath.Join(passwordStoreDir, "community-tc", "imagesets")
	imageSetDirs, err := ioutil.ReadDir(imageSetsDir)
	if err != nil {
		return nil, fmt.Errorf("Cannot find rsa keys for workers in directory %v - have you installed/configured pass (passwordstore.org)? %v", imageSetsDir, err)
	}
	return imageSetDirs, nil
}

func main() {
	ConfigureLogging()

	imageSetDirs, err := ImageSetDirs()
	ExitOnError(err)
	allWorkerPools, err := AllWorkerPools()
	ExitOnError(err)
	workerPools, err := FilterWorkerPools(os.Args[1:], allWorkerPools)
	ExitOnError(err)

	Title("Image sets")
	for _, i := range imageSetDirs {
		fmt.Println(i.Name())
	}

	Title("Worker Pools")
	for _, i := range workerPools.SortedNames() {
		fmt.Println(i)
	}
}

// Title writes three lines to standard out: a blank line, title, and a string
// of '=' characters with length of title
func Title(title string) {
	fmt.Println("")
	fmt.Println(title)
	for _ = range title {
		fmt.Print("=")
	}
	fmt.Println("")
}

// AllWorkerPools queries Worker Manager (using taskcluster environment
// variables to connect) for all worker pool full definitions
func AllWorkerPools() (WorkerPools, error) {
	workermanager := tcworkermanager.NewFromEnv()
	allWorkerPools := WorkerPools{}
	continuationToken := ""
	for {
		workerPools, err := workermanager.ListWorkerPools(continuationToken, "")
		if err != nil {
			return nil, err
		}
		for _, workerPool := range workerPools.WorkerPools {
			allWorkerPools[workerPool.WorkerPoolID] = workerPool
		}
		continuationToken = workerPools.ContinuationToken
		if continuationToken == "" {
			break
		}
	}
	return allWorkerPools, nil
}

// FilterWorkerPools takes a list of POSIX regular expressions and a set of
// worker pool definitions, and returns the subset of worker pool definitions
// whose name match one of the regular expressions. If args is nil or has no
// elements, workerPools is returned.
func FilterWorkerPools(regularExpressions []string, workerPools WorkerPools) (WorkerPools, error) {
	// If no regular expressions, return all worker pools.
	if len(regularExpressions) == 0 {
		return workerPools, nil
	}
	filteredWorkerPools := WorkerPools{}
	for i := range regularExpressions {
		re, err := regexp.CompilePOSIX(regularExpressions[i])
		if err != nil {
			return nil, fmt.Errorf("Argument %q is not a valid POSIX ERE (egrep) regular expression: %v", regularExpressions[i], err)
		}
		for j := range workerPools {
			if re.MatchString(workerPools[j].WorkerPoolID) {
				filteredWorkerPools[workerPools[j].WorkerPoolID] = workerPools[j]
			}
		}
	}
	return filteredWorkerPools, nil
}

func (workerPools WorkerPools) SortedNames() []string {
	workerPoolNames := make([]string, 0, len(workerPools))
	for k := range workerPools {
		workerPoolNames = append(workerPoolNames, k)
	}
	sort.Strings(workerPoolNames)
	return workerPoolNames
}
