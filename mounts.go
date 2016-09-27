package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mholt/archiver"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-base-go/scopes"
)

var (
	// downloaded files that may be archives or individual files are stored in
	// fileCache, against a unique key that identifies where they were
	// downloaded from. The map values are the paths of the downloaded files
	// relative to the downloads directory specified in the global config file
	// on the worker.
	fileCaches CacheMap = CacheMap{}
	// writable directory caches that may be preloaded or initially empty. Note
	// a preloaded cache will have an associated file cache for the archive it
	// was created from. The key is the cache name.
	directoryCaches CacheMap = CacheMap{}
)

type CacheMap map[string]*Cache

func (fc CacheMap) SortedResources() Resources {
	r := make(Resources, len(fc))
	i := 0
	for _, cache := range fc {
		r[i] = cache
		i++
	}
	sort.Sort(r)
	return r
}

type Cache struct {
	// the full path to the cache on disk (could be file or directory)
	Location string
	// the number of times this file has been included in a MountEntry on a
	// task run on this worker
	Hits int
	// the size of the file in bytes (cached for performance, as it is
	// immutable file)
	Size int64
}

// Rating determines how valuable the file cache is compared to other file
// caches. We will base this entirely on how many times it was used before.
// The more times it was referenced in a task that already ran on this
// worker, the higher the rating will be. For now we'll disregard disk
// space taken up.
func (fc *Cache) Rating() float64 {
	return float64(fc.Hits)
}

func (fc *Cache) Expunge() error {
	return os.RemoveAll(fc.Location)
}

// Represents the Mounts feature as a whole - one global instance
type MountsFeature struct {
}

func (feature *MountsFeature) Initialise() error {
	err := ensureEmptyDir(config.CachesDir)
	if err != nil {
		return fmt.Errorf("Could not empty dir %v when initialising mounts feature - error: %v", config.CachesDir, err)
	}
	return ensureEmptyDir(config.DownloadsDir)
}

func ensureEmptyDir(dir string) error {
	err := os.MkdirAll(dir, 0777)
	if err != nil {
		return err
	}
	files, err := ioutil.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, file := range files {
		err := os.RemoveAll(filepath.Join(dir, file.Name()))
		if err != nil {
			return err
		}
	}
	return nil
}

// Represents the Mounts feature for an individual task (one per task)
type TaskMount struct {
	task   *TaskRun
	mounts []MountEntry
	// payload errors are detected when creating feature but only reported when
	// feature starts, so need to keep hold of any error raised...
	payloadError   error
	requiredScopes scopes.Required
}

// Represents an individual Mount listed in task payload - there
// can be several mounts per task
type MountEntry interface {
	Mount() error
	Unmount() error
	FSContent() (FSContent, error)
	RequiredScopes() []string
}

// FSContent represents file system content - it is based on the auto-generated
// type Content which is json.RawMessage, which can be ArtifactContent or
// URLContent concrete types. This is the interface which represents these
// underlying concrete types.
type FSContent interface {
	// Keep it simple and just return a []string, rather than scopes.Required
	// since currently no easy way to "AND" scopes.Required types.
	RequiredScopes() []string
	// Download the content, and return the absolute location of the file. No
	// archive extraction is performed.
	Download() (string, error)
	// UniqueKey returns a string which represents the content, such that if
	// two FSContent types return the same key, it can be assumed they
	// represent the same content.
	UniqueKey() string
}

// No scopes required
func (ac *URLContent) RequiredScopes() []string {
	return []string{}
}

// Scopes queue:get-artifact:<artifact-name> required for non public/ artifacts
func (ac *ArtifactContent) RequiredScopes() []string {
	if strings.HasPrefix(ac.Artifact, "public/") {
		return []string{}
	}
	return []string{"queue:get-artifact:" + ac.Artifact}
}

// Since mounts are protected by scopes per mount, no reason to have
// a feature flag to enable. Having mounts in the payload is enough.
func (feature *MountsFeature) IsEnabled(fl EnabledFeatures) bool {
	return true
}

// Reads payload and initialises state...
func (feature *MountsFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	tm := &TaskMount{
		task:   task,
		mounts: []MountEntry{},
	}
	for i, taskMount := range task.Payload.Mounts {
		// Each mount must be one of:
		//   * WritableDirectoryCache
		//   * ReadOnlyDirectory
		//   * FileMount
		// We have to check keys to find out...
		var m map[string]interface{}
		if err := json.Unmarshal(taskMount, &m); err != nil {
			tm.payloadError = fmt.Errorf("Could not read task mount %v: %v\n%v", i, string(taskMount), err)
			return tm
		}
		switch {
		case m["cacheName"] != nil:
			tm.Unmarshal(taskMount, &WritableDirectoryCache{})
		case m["directory"] != nil:
			tm.Unmarshal(taskMount, &ReadOnlyDirectory{})
		case m["file"] != nil:
			tm.Unmarshal(taskMount, &FileMount{})
		default:
			tm.payloadError = fmt.Errorf("Unrecognised mount entry in payload - %#v", m)
		}
	}
	tm.initRequiredScopes()
	return tm
}

// Utility method to unmarshal a json blob and add it to the mounts in the TaskMount
func (tm *TaskMount) Unmarshal(rm json.RawMessage, m MountEntry) {
	// only update if nil, otherwise we could replace a previous error with nil
	if tm.payloadError == nil {
		tm.payloadError = json.Unmarshal(rm, m)
		tm.mounts = append(tm.mounts, m)
	}
}

// Note, we've calculated the required scopes in NewTaskFeature(...) already -
// we do this in advance in case there is an error, we can report it upfront
// when we initialise, rather than later when we go to check what scopes are
// needed.
func (taskMount *TaskMount) RequiredScopes() scopes.Required {
	return taskMount.requiredScopes
}

// loops through all referenced mounts and checks what scopes are required to
// mount them
func (taskMount *TaskMount) initRequiredScopes() {
	requiredScopes := []string{}
	for _, mount := range taskMount.mounts {
		requiredScopes = append(requiredScopes, mount.RequiredScopes()...)
		fsContent, err := mount.FSContent()
		if err != nil {
			taskMount.payloadError = err
			return
		}
		// A writable cache might not be preloaded so might have no initial content
		if fsContent != nil {
			requiredScopes = append(requiredScopes, fsContent.RequiredScopes()...)
		}
	}
	taskMount.requiredScopes = scopes.Required{requiredScopes}
}

// Here the order is important. We want to delete file caches before we delete
// writable directory caches, since writable directory caches are typically the
// result of a compilation, which is slow, whereas downloading files is
// relatively quick in comparison.
func clearCaches() error {
	r := fileCaches.SortedResources()
	r = append(r, directoryCaches.SortedResources()...)
	return runGarbageCollection(r)
}

// called when a task starts
func (taskMount *TaskMount) Start() *CommandExecutionError {
	if taskMount.payloadError != nil {
		return MalformedPayload(taskMount.payloadError)
	}
	// Let's perform a garbage collection here before running the task. In
	// taskcluster-worker this will run in its own thread, and here it only
	// works as we have a single job running at a time, so we don't need to
	// worry about concurrency etc. But it is ugly to do it here, but
	// sufficient for generic worker.
	err := clearCaches()
	if err != nil {
		panic(err)
	}
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err = mount.Mount()
		if err != nil {
			panic(err)
		}
	}
	return nil
}

// called when a task has completed
func (taskMount *TaskMount) Stop() *CommandExecutionError {
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err := mount.Unmount()
		if err != nil {
			panic(err)
		}
	}
	return nil
}

// Writable caches require scope generic-worker:cache:<cacheName>. Preloaded caches
// from an artifact may also require scopes - handled separately.
func (w *WritableDirectoryCache) RequiredScopes() []string {
	return []string{"generic-worker:cache:" + w.CacheName}
}

// Returns either a *URLContent or *ArtifactContent that is listed in the given
// *WritableDirectoryCache
func (w *WritableDirectoryCache) FSContent() (FSContent, error) {
	// no content if an empty cache folder, e.g. object directory
	if w.Content != nil {
		return w.Content.FSContent()
	}
	return nil, nil
}

// No scopes directly required for a ReadOnlyDirectory (scopes may be required
// for its content though - handled separately)
func (r *ReadOnlyDirectory) RequiredScopes() []string {
	return []string{}
}

// Returns either a *URLContent or *ArtifactContent that is listed in the given
// *ReadOnlyDirectory
func (r *ReadOnlyDirectory) FSContent() (FSContent, error) {
	return r.Content.FSContent()
}

// No scopes directly required for a FileMount (scopes may be required for its
// content though - handled separately)
func (f *FileMount) RequiredScopes() []string {
	return []string{}
}

// Returns either a *URLContent or *ArtifactContent that is listed in the given
// *FileMount
func (f *FileMount) FSContent() (FSContent, error) {
	return f.Content.FSContent()
}

func (w *WritableDirectoryCache) Mount() error {
	// cache already there?
	if _, dirCacheExists := directoryCaches[w.CacheName]; dirCacheExists {
		// bump counter
		directoryCaches[w.CacheName].Hits++
		// move it into place...
		err := os.Rename(directoryCaches[w.CacheName].Location, filepath.Join(TaskUser.HomeDir, w.Directory))
		if err != nil {
			return fmt.Errorf("Not able to rename dir: %v", err)
		}
		err = os.Chmod(filepath.Join(TaskUser.HomeDir, w.Directory), 0777)
		if err != nil {
			return fmt.Errorf("Not able to make cache %v writable to task user: %v", w.CacheName, err)
		}
		return nil
	}
	// new cache, let's initialise it...
	directoryCaches[w.CacheName] = &Cache{
		Hits: 1,
	}
	// preloaded content?
	if w.Content != nil {
		c, err := w.Content.FSContent()
		if err != nil {
			return fmt.Errorf("Not able to retrieve FSContent: %v", err)
		}
		err = extract(c, w.Format, filepath.Join(TaskUser.HomeDir, w.Directory))
		if err != nil {
			return err
		}
		return nil
	}
	// no preloaded content => just create dir in place
	err := os.MkdirAll(filepath.Join(TaskUser.HomeDir, w.Directory), 0777)
	if err != nil {
		return fmt.Errorf("Not able to create dir: %v", err)
	}
	return nil
}

func (r *ReadOnlyDirectory) Mount() error {
	c, err := r.Content.FSContent()
	if err != nil {
		return fmt.Errorf("Not able to retrieve FSContent: %v", err)
	}
	return extract(c, r.Format, filepath.Join(TaskUser.HomeDir, r.Directory))
}

func (f *FileMount) Mount() error {
	c, err := f.Content.FSContent()
	if err != nil {
		return err
	}
	err = mountFile(c, filepath.Join(TaskUser.HomeDir, f.File))
	if err != nil {
		return err
	}
	err = os.Chmod(filepath.Join(TaskUser.HomeDir, f.File), 0644)
	if err != nil {
		return fmt.Errorf("Not able to make file %v read-only to task user: %v", f.File, err)
	}
	return nil
}

func (w *WritableDirectoryCache) Unmount() error {
	basename := slugid.Nice()
	file := filepath.Join(config.CachesDir, basename)
	directoryCaches[w.CacheName] = &Cache{Location: file}
	log.Printf("Moving %q to %q", filepath.Join(TaskUser.HomeDir, w.Directory), file)
	err := os.Rename(filepath.Join(TaskUser.HomeDir, w.Directory), file)
	if err != nil {
		return err
	}
	err = os.Chmod(file, 0700)
	if err != nil {
		return fmt.Errorf("Not able to make cache %v unreadable and unwritable to all task users when unmounting it: %v", w.CacheName, err)
	}
	return nil
}

// Nothing to do - original archive file wasn't moved
func (r *ReadOnlyDirectory) Unmount() error {
	return nil
}

func (f *FileMount) Unmount() error {
	fsContent, err := f.FSContent()
	if err != nil {
		return err
	}
	log.Printf("Moving %q to %q", filepath.Join(TaskUser.HomeDir, f.File), fileCaches[fsContent.UniqueKey()])
	err = os.Rename(filepath.Join(TaskUser.HomeDir, f.File), fileCaches[fsContent.UniqueKey()].Location)
	if err != nil {
		return err
	}
	err = os.Chmod(fileCaches[fsContent.UniqueKey()].Location, 0600)
	if err != nil {
		return fmt.Errorf("Not able to make file mount %v unreadable and unwritable to all task users when unmounting it: %v", f.File, err)
	}
	return nil
}

// ensureCached returns a file containing the given content
func ensureCached(fsContent FSContent) (file string, err error) {
	cacheKey := fsContent.UniqueKey()
	if _, inCache := fileCaches[cacheKey]; !inCache {
		file, err := fsContent.Download()
		if err != nil {
			return "", err
		}
		// now check the file size ...
		f, err := os.Open(file)
		if err != nil {
			return "", err
		}
		defer f.Close()
		fi, err := f.Stat()
		if err != nil {
			return "", err
		}
		fileCaches[cacheKey] = &Cache{Location: file, Hits: 1, Size: fi.Size()}
	} else {
		fileCaches[cacheKey].Hits += 1
	}
	return fileCaches[cacheKey].Location, nil
}

func mountFile(fsContent FSContent, file string) error {
	cacheFile, err := ensureCached(fsContent)
	if err != nil {
		return err
	}
	parentDir := filepath.Dir(file)
	err = os.MkdirAll(parentDir, 0777)
	if err != nil {
		return err
	}
	err = os.Rename(cacheFile, file)
	if err != nil {
		return fmt.Errorf("Could not rename file %v as %v due to %v", cacheFile, file, err)
	}
	return nil
}

func extract(fsContent FSContent, format string, dir string) error {
	cacheFile, err := ensureCached(fsContent)
	if err != nil {
		return err
	}
	err = os.MkdirAll(dir, 0777)
	if err != nil {
		return err
	}
	switch format {
	case "zip":
		return archiver.Unzip(cacheFile, dir)
	case "tar.gz":
		return archiver.UntarGz(cacheFile, dir)
	case "rar":
		return archiver.Unrar(cacheFile, dir)
	case "tar.bz2":
		return archiver.UntarBz2(cacheFile, dir)
	}
	log.Fatalf("Unsupported format %v", format)
	return nil
}

// Returns either a *ArtifactContent or *URLContent based on the content
// (json.RawMessage)
func (c Content) FSContent() (FSContent, error) {
	// c must be one of:
	//   * ArtifactContent
	//   * URLContent
	// We have to check keys to find out...
	var m map[string]interface{}
	if err := json.Unmarshal(c, &m); err != nil {
		return nil, err
	}
	switch {
	case m["artifact"] != nil:
		return c.Unmarshal(&ArtifactContent{})
	case m["url"] != nil:
		return c.Unmarshal(&URLContent{})
	}
	return nil, errors.New("Unrecognised mount entry in payload")
}

// Utility method to unmarshal Content (json.RawMessage) into *ArtifactContent
// or *URLContent (or anything that implements FSContent interface)
func (c Content) Unmarshal(fsContent FSContent) (FSContent, error) {
	err := json.Unmarshal(c, fsContent)
	return fsContent, err
}

// Downloads ArtifactContent to a file inside the downloads directory specified
// in the global config file. The filename is a random slugid, and the
// absolute path of the file is returned.
func (ac *ArtifactContent) Download() (string, error) {
	basename := slugid.Nice()
	file := filepath.Join(config.DownloadsDir, basename)
	signedURL, err := Queue.GetLatestArtifact_SignedURL(ac.TaskID, ac.Artifact, time.Minute*30)
	if err != nil {
		return "", err
	}
	return file, downloadURLToFile(signedURL.String(), file)
}

func (ac *ArtifactContent) UniqueKey() string {
	return "artifact:" + ac.TaskID + ":" + ac.Artifact
}

// Downloads URLContent to a file inside the caches directory specified in the
// global config file.  The filename is a random slugid, and the absolute path
// of the file is returned.
func (uc *URLContent) Download() (string, error) {
	basename := slugid.Nice()
	file := filepath.Join(config.DownloadsDir, basename)
	return file, downloadURLToFile(uc.URL, file)
}

func (uc *URLContent) UniqueKey() string {
	return "urlcontent:" + uc.URL
}

// Utility function to aggressively download a url to a file location
func downloadURLToFile(url, file string) error {
	log.Printf("Downloading url %v to %v", url, file)
	err := os.MkdirAll(filepath.Dir(file), 0777)
	if err != nil {
		return err
	}
	resp, _, err := httpbackoff.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	if err != nil {
		return err
	}
	return nil
}
