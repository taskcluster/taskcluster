package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mholt/archiver"
	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcpurgecache"
)

var (
	// downloaded files that may be archives or individual files are stored in
	// fileCache, against a unique key that identifies where they were
	// downloaded from. The map values are the paths of the downloaded files
	// relative to the downloads directory specified in the global config file
	// on the worker.
	fileCaches CacheMap
	// writable directory caches that may be preloaded or initially empty. Note
	// a preloaded cache will have an associated file cache for the archive it
	// was created from. The key is the cache name.
	directoryCaches CacheMap
	// service to call to see if any caches need to be purged. See
	// https://docs.taskcluster.net/reference/core/purge-cache
	pc *tcpurgecache.PurgeCache
	// we track this in order to reduce number of results we get back from
	// purge cache service
	lastQueriedPurgeCacheService time.Time
)

type (
	CacheMap map[string]*Cache
)

func (cm CacheMap) SortedResources() Resources {
	r := make(Resources, len(cm))
	i := 0
	for _, cache := range cm {
		r[i] = cache
		i++
	}
	sort.Sort(r)
	return r
}

type Cache struct {
	Created time.Time `json:"created"`
	// the full path to the cache on disk (could be file or directory)
	Location string `json:"location"`
	// the number of times this cache has been included in a MountEntry on a
	// task run on this worker
	Hits int `json:"hits"`
	// The map that tracks the cache, needed for expunging the cache
	// Don't store in json, otherwise we'll have circular structure and create
	// an infinite file!
	Owner CacheMap `json:"-"`
	// The key used in the CacheMap
	Key string `json:"key"`
	// SHA256 of content, if a file (not used for directories)
	SHA256 string `json:"sha256"`
}

// Rating determines how valuable the file cache is compared to other file
// caches. We will base this entirely on how many times it was used before.
// The more times it was referenced in a task that already ran on this
// worker, the higher the rating will be. For now we'll disregard disk
// space taken up.
func (cache *Cache) Rating() float64 {
	return float64(cache.Hits)
}

func (cache *Cache) Expunge() error {
	// delete the cache on the file system
	err := os.RemoveAll(cache.Location)
	if err != nil {
		return err
	}
	// remove the cache from the CacheMap
	delete(cache.Owner, cache.Key)
	return nil
}

// Represents the Mounts feature as a whole - one global instance
type MountsFeature struct {
}

func (feature *MountsFeature) Name() string {
	return "Mounts/Caches"
}

func (feature *TaskMount) ReservedArtifacts() []string {
	return []string{}
}

func (feature *MountsFeature) PersistState() (err error) {
	err = fileutil.WriteToFileAsJSON(&fileCaches, "file-caches.json")
	if err != nil {
		return
	}
	err = fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json")
	return
}

func (cm *CacheMap) LoadFromFile(stateFile string, cacheDir string) (err error) {
	_, err = os.Stat(stateFile)
	if err != nil {
		log.Printf("No %v file found, creating empty CacheMap", stateFile)
		*cm = CacheMap{}
		err = os.MkdirAll(cacheDir, 0777)
		if err != nil {
			return
		}
	} else {
		err = loadFromJSONFile(cm, stateFile)
		if err != nil {
			return
		}
		for i, _ := range *cm {
			(*cm)[i].Owner = *cm
		}
	}
	return
}

func (feature *MountsFeature) Initialise() error {
	fileCaches.LoadFromFile("file-caches.json", config.CachesDir)
	directoryCaches.LoadFromFile("directory-caches.json", config.DownloadsDir)
	// TODO: delete empty cache dirs and downloads that are not in list

	// err := ensureEmptyDir(config.CachesDir)
	// if err != nil {
	// 	return fmt.Errorf("Could not empty caches dir %v when initialising mounts feature - error: %v", config.CachesDir, err)
	// }
	// err = ensureEmptyDir(config.DownloadsDir)
	// if err != nil {
	// 	return fmt.Errorf("Could not empty downloads dir %v when initialising mounts feature - error: %v", config.DownloadsDir, err)
	// }
	pc = tcpurgecache.New(nil)
	return nil
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
	Mount(task *TaskRun) error
	Unmount(task *TaskRun) error
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
	Download(task *TaskRun) (file string, sha256 string, err error)
	// UniqueKey returns a string which represents the content, such that if
	// two FSContent types return the same key, it can be assumed they
	// represent the same content.
	UniqueKey() string
	// SHA256 of the content.
	RequiredSHA256() string
	// String representation of where the content comes from
	String() string
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
func (feature *MountsFeature) IsEnabled(task *TaskRun) bool {
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
func garbageCollection() error {
	r := fileCaches.SortedResources()
	r = append(r, directoryCaches.SortedResources()...)
	return runGarbageCollection(r)
}

// called when a task starts
func (taskMount *TaskMount) Start() *CommandExecutionError {
	if taskMount.payloadError != nil {
		return MalformedPayloadError(taskMount.payloadError)
	}
	// Check if any caches need to be purged. See:
	//   https://docs.taskcluster.net/reference/core/purge-cache
	err := taskMount.purgeCaches()
	// Two possible strategies if we can't reach purgecache service:
	//
	//   1) be optimistic, assume caches are ok, and don't purge them
	//   2) be pessemistic, and delete existing caches
	//
	// Let's go with 1) for now, as 2) could cause tree closures if purgecache
	// services has an outage. Although 1) could not be part of an obscure
	// attack strategy (although releases shouldn't use caches).
	if err != nil {
		taskMount.task.Warn("[mounts] Could not reach purgecache service to see if caches need purging:")
		taskMount.task.Warn("[mounts] " + err.Error())
	}
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err = mount.Mount(taskMount.task)
		// An error is returned if it is a task problem, such as an invalid url
		// to download content, or a downloaded archive cannot be extracted.
		// If the problem is internal (e.g. can't mount a writable cache) then
		// this is handled by a panic.
		if err != nil {
			return Failure(err)
		}
	}
	return nil
}

// called when a task has completed
func (taskMount *TaskMount) Stop() *CommandExecutionError {
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err := mount.Unmount(taskMount.task)
		if err != nil {
			log.Printf("Could not unmount due to: %v", err)
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
		return FSContentFrom(w.Content)
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
	return FSContentFrom(r.Content)
}

// No scopes directly required for a FileMount (scopes may be required for its
// content though - handled separately)
func (f *FileMount) RequiredScopes() []string {
	return []string{}
}

// Returns either a *URLContent or *ArtifactContent that is listed in the given
// *FileMount
func (f *FileMount) FSContent() (FSContent, error) {
	return FSContentFrom(f.Content)
}

func (w *WritableDirectoryCache) makeCacheReadable(task *TaskRun) {
	target := filepath.Join(taskContext.TaskDir, w.Directory)
	task.Infof("[mounts] Granting task user full control of '%v' and subdirectories", target)
	err := makeDirReadableForTaskUser(target)
	if err != nil {
		panic(fmt.Errorf("Not able to make cache %v writable to task user: %v", w.CacheName, err))
	}
	task.Infof("[mounts] Successfully mounted writable directory cache '%v'", target)
}

func (w *WritableDirectoryCache) Mount(task *TaskRun) error {
	// cache already there?
	if _, dirCacheExists := directoryCaches[w.CacheName]; dirCacheExists {
		// bump counter
		directoryCaches[w.CacheName].Hits++
		// move it into place...
		src := directoryCaches[w.CacheName].Location
		target := filepath.Join(taskContext.TaskDir, w.Directory)
		parentDir := filepath.Dir(target)
		task.Infof("[mounts] Mounting existing writable directory cache %v at path '%v'", w.CacheName, target)
		err := os.MkdirAll(parentDir, 0700)
		if err != nil {
			panic(fmt.Errorf("Not able to create directory %v with permissions 0700: %v", parentDir, err))
		}
		err = RenameCrossDevice(src, target)
		if err != nil {
			panic(fmt.Errorf("Not able to rename dir %v as %v: %v", src, target, err))
		}
		w.makeCacheReadable(task)
		return nil
	}
	// new cache, let's initialise it...
	task.Infof("[mounts] No existing writable directory cache '%v' - creating...", w.CacheName)
	basename := slugid.Nice()
	file := filepath.Join(config.CachesDir, basename)
	directoryCaches[w.CacheName] = &Cache{
		Hits:     1,
		Created:  time.Now(),
		Location: file,
		Owner:    directoryCaches,
		Key:      w.CacheName,
	}
	// preloaded content?
	if w.Content != nil {
		c, err := FSContentFrom(w.Content)
		if err != nil {
			return fmt.Errorf("Not able to retrieve FSContent: %v", err)
		}
		err = extract(c, w.Format, filepath.Join(taskContext.TaskDir, w.Directory), task)
		if err != nil {
			return err
		}
		w.makeCacheReadable(task)
		return nil
	}
	// no preloaded content => just create dir in place
	err := os.MkdirAll(filepath.Join(taskContext.TaskDir, w.Directory), 0700)
	if err != nil {
		panic(fmt.Errorf("Not able to create dir: %v", err))
	}
	w.makeCacheReadable(task)
	return nil
}

func (w *WritableDirectoryCache) Unmount(task *TaskRun) error {
	cacheDir := directoryCaches[w.CacheName].Location
	log.Printf("Moving %q to %q", filepath.Join(taskContext.TaskDir, w.Directory), cacheDir)
	err := RenameCrossDevice(filepath.Join(taskContext.TaskDir, w.Directory), cacheDir)
	if err != nil {
		panic(err)
	}
	err = makeDirUnreadable(cacheDir)
	if err != nil {
		panic(fmt.Errorf("Not able to make cache %v unreadable and unwritable to all task users when unmounting it: %v", w.CacheName, err))
	}
	return nil
}

func (r *ReadOnlyDirectory) Mount(task *TaskRun) error {
	c, err := FSContentFrom(r.Content)
	if err != nil {
		return fmt.Errorf("Not able to retrieve FSContent: %v", err)
	}
	return extract(c, r.Format, filepath.Join(taskContext.TaskDir, r.Directory), task)
}

// Nothing to do - original archive file wasn't moved
func (r *ReadOnlyDirectory) Unmount(task *TaskRun) error {
	return nil
}

func (f *FileMount) Mount(task *TaskRun) error {
	fsContent, err := FSContentFrom(f.Content)
	if err != nil {
		return err
	}
	cacheFile, err := ensureCached(fsContent, task)
	if err != nil {
		return err
	}
	file := filepath.Join(taskContext.TaskDir, f.File)
	parentDir := filepath.Dir(file)
	err = os.MkdirAll(parentDir, 0777)
	// this could be a user error, if someone supplies an invalid path, so let's not
	// panic, but make this a task failure
	if err != nil {
		return err
	}
	// Let's copy rather than move, since we want to be totally sure that the
	// task can't modify the contents, and setting as read-only is not enough -
	// the user could change the rights and then modify it.
	task.Infof("[mounts] Copying cached version of %v to %v", fsContent.String(), file)
	err = copyFileContents(cacheFile, file)
	if err != nil {
		// this could be a system error, but it can also be that e.g. the task
		// specified an invalid path, so resolve as malformed payload rather
		// than panic
		task.Errorf("[mounts] Not able to mount content from %v at path %v", fsContent.String(), file)
		task.Infof("%v", err)
		return err
	}
	return nil
}

// Nothing to do - original archive file was copied, not moved
func (f *FileMount) Unmount(task *TaskRun) error {
	return nil
}

// ensureCached returns a file containing the given content
func ensureCached(fsContent FSContent, task *TaskRun) (file string, err error) {
	cacheKey := fsContent.UniqueKey()
	var sha256 string
	if _, inCache := fileCaches[cacheKey]; !inCache {
		// fsContent.Download already takes care of ensuring SHA256 is correct,
		// so don't need to do that here
		file, sha256, err = fsContent.Download(task)
		if err != nil {
			log.Printf("Could not download %v due to %v", fsContent.UniqueKey(), err)
			return
		}
		fileCaches[cacheKey] = &Cache{
			Location: file,
			Hits:     1,
			Created:  time.Now(),
			Owner:    fileCaches,
			Key:      cacheKey,
			SHA256:   sha256,
		}
		err = validateSHA256(fsContent.String(), sha256, fsContent.RequiredSHA256(), task)
		return
	}
	file = fileCaches[cacheKey].Location
	// Sanity check - if file is in file map, but not on file system,
	// something is seriously wrong, so should be a worker exception
	// (panic), not a task failure
	_, err = os.Stat(file)
	if err != nil {
		panic(fmt.Errorf("File in cache, but not on filesystem: %v", *fileCaches[cacheKey]))
	}
	fileCaches[cacheKey].Hits += 1

	// validate SHA256 in case of tampering
	sha256, err = fileutil.CalculateSHA256(file)
	if err != nil {
		panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I have in my cache: %v", file, err))
	}
	if requiredSHA256 := fsContent.RequiredSHA256(); requiredSHA256 != "" {
		if requiredSHA256 != sha256 {
			err = fmt.Errorf("[mounts] Found existing download of %v with SHA256 %v but task definition explicitly requires %v", cacheKey, sha256, requiredSHA256)
		} else {
			task.Infof("[mounts] Found existing download for %v with (correct) SHA256 %v", cacheKey, sha256)
		}
	} else {
		task.Warnf("[mounts] Found existing download for %v with SHA256 %v, but since no required SHA256 is specified in task mounts, it is not possible to verify the integrity of this file", cacheKey, sha256)
	}
	return
}

func extract(fsContent FSContent, format string, dir string, task *TaskRun) error {
	cacheFile, err := ensureCached(fsContent, task)
	if err != nil {
		log.Printf("Could not cache content: %v", err)
		return err
	}
	log.Printf("Extracting %v file '%v' to '%v'", format, cacheFile, dir)
	task.Infof("[mounts] Extracting %v file from %v to '%v'", format, fsContent.String(), dir)
	err = os.MkdirAll(dir, 0777)
	if err != nil {
		log.Printf("Could not MkdirAll %v: %v", dir, err)
		return err
	}
	switch format {
	case "zip":
		return archiver.Zip.Open(cacheFile, dir)
	case "tar.gz":
		return archiver.TarGz.Open(cacheFile, dir)
	case "rar":
		return archiver.Rar.Open(cacheFile, dir)
	case "tar.bz2":
		return archiver.TarBz2.Open(cacheFile, dir)
	}
	log.Fatalf("Unsupported format %v", format)
	return fmt.Errorf("Unsupported archive format %v", format)
}

// Returns either a *ArtifactContent or *URLContent based on the content
// (json.RawMessage)
func FSContentFrom(c json.RawMessage) (FSContent, error) {
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
		return UnmarshalInto(c, &ArtifactContent{})
	case m["url"] != nil:
		return UnmarshalInto(c, &URLContent{})
	}
	return nil, errors.New("Unrecognised mount entry in payload")
}

// Utility method to unmarshal Content (json.RawMessage) into *ArtifactContent
// or *URLContent (or anything that implements FSContent interface)
func UnmarshalInto(c json.RawMessage, fsContent FSContent) (FSContent, error) {
	err := json.Unmarshal(c, fsContent)
	return fsContent, err
}

// Downloads ArtifactContent to a file inside the downloads directory specified
// in the global config file. The filename is a random slugid, and the
// absolute path of the file is returned.
func (ac *ArtifactContent) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	var signedURL *url.URL
	signedURL, err = queue.GetLatestArtifact_SignedURL(ac.TaskID, ac.Artifact, time.Minute*30)
	if err != nil {
		return
	}
	sha256, err = downloadURLToFile(signedURL.String(), ac.String(), file, task)
	return
}

func (ac *ArtifactContent) String() string {
	return "task " + ac.TaskID + " artifact " + ac.Artifact
}

func (ac *ArtifactContent) UniqueKey() string {
	return "artifact:" + ac.TaskID + ":" + ac.Artifact
}

func (ac *ArtifactContent) RequiredSHA256() string {
	return ac.Sha256
}

// Downloads URLContent to a file inside the caches directory specified in the
// global config file.  The filename is a random slugid, and the absolute path
// of the file is returned.
func (uc *URLContent) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256, err = downloadURLToFile(uc.URL, uc.String(), file, task)
	return
}

func (uc *URLContent) String() string {
	return "url " + uc.URL
}

func (uc *URLContent) UniqueKey() string {
	return "urlcontent:" + uc.URL
}

func (uc *URLContent) RequiredSHA256() string {
	return uc.Sha256
}

func validateSHA256(contentSource, sha256, requiredSHA256 string, task *TaskRun) error {
	if requiredSHA256 == "" {
		task.Warnf("[mounts] Content from %v has SHA256 %v but task payload does not declare a required value, so content authenticity cannot be verified", contentSource, sha256)
		return nil
	}
	if requiredSHA256 != sha256 {
		return fmt.Errorf("[mounts] SHA256 of content from %v was %v but task definition explicitly requires %v", contentSource, sha256, requiredSHA256)
	}
	task.Infof("[mounts] Content from %v matched required SHA256 (%v)", contentSource, sha256)
	return nil
}

// Utility function to aggressively download a url to a file location
func downloadURLToFile(url, contentSource, file string, task *TaskRun) (sha256 string, err error) {
	task.Infof("[mounts] Downloading %v to %v", contentSource, file)
	err = os.MkdirAll(filepath.Dir(file), 0777)
	if err != nil {
		task.Errorf("[mounts] Could not make MkdirAll %v: %v", filepath.Dir(file), err)
		return
	}
	var contentSize int64
	// httpbackoff.Get(url) is not sufficient as that only guarantees we have
	// an http response to read from, but does not retry if we lose
	// connectivity while reading from it. Therefore include the reading of the
	// response body inside the retry function.
	retryFunc := func() (resp *http.Response, tempError error, permError error) {
		resp, err := http.Get(url)
		// assume all errors should result in a retry
		if err != nil {
			return resp, err, nil
		}
		defer resp.Body.Close()
		f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
		if err != nil {
			task.Errorf("[mounts] Could not open file %v: %v", file, err)
			// permanent error!
			return resp, nil, err
		}
		defer f.Close()
		contentSize, err = io.Copy(f, resp.Body)
		if err != nil {
			task.Errorf("[mounts] Could not write http response from %v to file %v: %v", contentSource, file, err)
			// likely a temporary error - network blip
			return resp, err, nil
		}
		return resp, nil, nil
	}
	_, _, err = httpbackoff.Retry(retryFunc)
	if err != nil {
		task.Errorf("[mounts] Could not fetch from %v into file %v: %v", contentSource, file, err)
		return
	}
	task.Infof("[mounts] Downloaded %v bytes of content from %v", contentSize, contentSource)
	sha256, err = fileutil.CalculateSHA256(file)
	if err != nil {
		panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I just downloaded: %v", file, err))
	}
	return
}

func (taskMount *TaskMount) purgeCaches() error {
	// Don't bother to query purge cache service if this task uses no writable
	// caches, and we queried already less than 6 hours ago. Service keeps
	// history for 24 hours, but is an implementation detail that could change.
	// Until we have a formal guarantee, let's run after 6 hours to be super
	// safe.
	writableCaches := []*WritableDirectoryCache{}
	for _, mount := range taskMount.mounts {
		switch t := mount.(type) {
		case *WritableDirectoryCache:
			writableCaches = append(writableCaches, t)
		}
	}
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	if len(writableCaches) == 0 && time.Now().Round(0).Sub(lastQueriedPurgeCacheService) < 6*time.Hour {
		return nil
	}
	// In case of clock drift, let's query all purge cache requests created
	// since 5 mins before our last request. In the worst case, it means we'll
	// get back more results than we need, but it won't cause us to clear
	// caches we shouldn't. This helps if the worker clock is up to 5 minutes
	// ahead of the purgecache service clock. If the worker clock is behind the
	// purgecache service clock, that is also no problem.  If this is the first
	// request since the worker started, we won't pass in a "since" date at
	// all.
	since := ""
	if !lastQueriedPurgeCacheService.IsZero() {
		since = tcclient.Time(lastQueriedPurgeCacheService.Add(-5 * time.Minute)).String()
	}
	lastQueriedPurgeCacheService = time.Now()
	purgeRequests, err := pc.PurgeRequests(config.ProvisionerID, config.WorkerType, since)
	if err != nil {
		return err
	}
	// Loop through results, and purge caches when we find an entry. Note,
	// again to account for clock drift, let's remove caches up to 5 minutes
	// older than the given "before" date.
	for _, request := range purgeRequests.Requests {
		if cache, exists := directoryCaches[request.CacheName]; exists {
			if cache.Created.Add(-5 * time.Minute).Before(time.Time(request.Before)) {
				err := cache.Expunge()
				if err != nil {
					panic(err)
				}
			}
		}
	}
	return nil
}
