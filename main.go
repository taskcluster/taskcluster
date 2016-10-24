//go:generate gw-codegen all-unix-style.yml generated_all-unix-style.go !windows
//go:generate gw-codegen windows.yml generated_windows.go

package main

import (
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/xeipuuv/gojsonschema"
)

var (
	// General platform independent user settings, such as home directory, username...
	// Platform specific data should be managed in plat_<platform>.go files
	TaskUser OSUser
	// Queue is the object we will use for accessing queue api. See
	// https://docs.taskcluster.net/reference/platform/queue/api-docs
	Queue *queue.Queue
	// See SignedURLsManager() for more information:
	// signedURsRequestChan is the channel you can pass a channel to, to get
	// back signed urls from the Task Cluster Queue, for querying Azure queues.
	signedURLsRequestChan chan chan *queue.PollTaskUrlsResponse
	// The *currently* one-and-only channel we request signedURLs to be written
	// to. In future we might require more channels to perform requests in
	// parallel, in which case we won't have a single global package var.
	signedURLsResponseChan chan *queue.PollTaskUrlsResponse
	config                 *Config
	configFile             string
	Features               []Feature = []Feature{
		&OSGroupsFeature{},
		&LiveLogFeature{},
		&ChainOfTrustFeature{},
		&MountsFeature{},
	}

	version = "6.0.7"
	usage   = `
generic-worker
generic-worker is a taskcluster worker that can run on any platform that supports go (golang).
See http://taskcluster.github.io/generic-worker/ for more details. Essentially, the worker is
the taskcluster component that executes tasks. It requests tasks from the taskcluster queue,
and reports back results to the queue.

  Usage:
    generic-worker run                      [--config         CONFIG-FILE]
                                            [--configure-for-aws]
    generic-worker install (startup|service [--nssm           NSSM-EXE]
                                            [--service-name   SERVICE-NAME])
                                            [--config         CONFIG-FILE]
                                            [--username       USERNAME]
                                            [--password       PASSWORD]
    generic-worker show-payload-schema
    generic-worker new-openpgp-keypair      --file PRIVATE-KEY-FILE
    generic-worker --help
    generic-worker --version

  Targets:
    run                                     Runs the generic-worker in an infinite loop.
    show-payload-schema                     Each taskcluster task defines a payload to be
                                            interpreted by the worker that executes it. This
                                            payload is validated against a json schema baked
                                            into the release. This option outputs the json
                                            schema used in this version of the generic
                                            worker.
    install                                 This will install the generic worker as a
                                            Windows service. If the Windows user USERNAME
                                            does not already exist on the system, the user
                                            will be created. This user will be used to run
                                            the service.
    new-openpgp-keypair                     This will generate a fresh, new OpenPGP
                                            compliant private/public key pair. The public
                                            key will be written to stdout and the private
                                            key will be written to the specified file.

  Options:
    --config CONFIG-FILE                    Json configuration file to use. See
                                            configuration section below to see what this
                                            file should contain. When calling the install
                                            target, this is the config file that the
                                            installation should use, rather than the
                                            config to use during install.
                                            [default: generic-worker.config]
    --configure-for-aws                     This will create the CONFIG-FILE for an AWS
                                            installation by querying the AWS environment
                                            and setting appropriate values.
    --nssm NSSM-EXE                         The full path to nssm.exe to use for
                                            installing the service.
                                            [default: C:\nssm-2.24\win64\nssm.exe]
    --service-name SERVICE-NAME             The name that the Windows service should be
                                            installed under. [default: Generic Worker]
    --username USERNAME                     The Windows user to run the generic worker
                                            Windows service as. If the user does not
                                            already exist on the system, it will be
                                            created. [default: GenericWorker]
    --password PASSWORD                     The password for the username specified
                                            with -u|--username option. If not specified
                                            a random password will be generated.
    --file PRIVATE-KEY-FILE                 The path to the file to write the private key
                                            to. The parent directory must already exist.
                                            If the file exists it will be overwritten,
                                            otherwise it will be created.
    --help                                  Display this help text.
    --version                               The release version of the generic-worker.


  Configuring the generic worker:

    The configuration file for the generic worker is specified with -c|--config CONFIG-FILE
    as described above. Its format is a json dictionary of name/value pairs.

        ** REQUIRED ** properties
        =========================

          accessToken                       Taskcluster access token used by generic worker
                                            to talk to taskcluster queue.
          clientId                          Taskcluster client id used by generic worker to
                                            talk to taskcluster queue.
          workerGroup                       Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
          workerId                          A name to uniquely identify your worker.
          workerType                        This should match a worker_type managed by the
                                            provisioner you have specified.
          livelogSecret                     This should match the secret used by the
                                            stateless dns server; see
                                            https://github.com/taskcluster/stateless-dns-server
          publicIP                          The IP address for clients to be directed to
                                            for serving live logs; see
                                            https://github.com/taskcluster/livelog and
                                            https://github.com/taskcluster/stateless-dns-server
          signingKeyLocation                The PGP signing key for signing artifacts with.

        ** OPTIONAL ** properties
        =========================

          certificate                       Taskcluster certificate, when using temporary
                                            credentials only.
          provisioner_id                    The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: aws-provisioner-v1]
          refreshURLsPrematurelySecs        The number of seconds before azure urls expire,
                                            that the generic worker should refresh them.
                                            [default: 310]
          livelogExecutable                 Filepath of LiveLog executable to use; see
                                            https://github.com/taskcluster/livelog
          subdomain                         Subdomain to use in stateless dns name for live
                                            logs; see
                                            https://github.com/taskcluster/stateless-dns-server
                                            [default: taskcluster-worker.net]
          livelogCertificate                SSL certificate to be used by livelog for hosting
                                            logs over https. If not set, http will be used.
          livelogKey                        SSL key to be used by livelog for hosting logs
                                            over https. If not set, http will be used.
          usersDir                          The location where user home directories should be
                                            created on the worker. [default: C:\Users]
          downloadsDir                      The location where resources are downloaded for
                                            populating preloaded caches and readonly mounts.
                                            [default: C:\generic-worker\downloads]
          cachesDir                         The location where task caches should be stored on
                                            the worker. [default: C:\generic-worker\caches]
          cleanUpTaskDirs                   Whether to delete the home directories of the task
                                            users after the task completes. Normally you would
                                            want to do this to avoid filling up disk space,
                                            but for one-off troubleshooting, it can be useful
                                            to (temporarily) leave home directories in place.
                                            Accepted values: true or false. [default: true]
          idleShutdownTimeoutSecs           How many seconds to wait without getting a new
                                            task to perform, before shutting down the computer.
                                            An integer, >= 0. A value of 0 means "do not shut
                                            the computer down" - i.e. continue running
                                            indefinitely.
          workerTypeMetaData                This arbitrary json blob will be uploaded as an
                                            artifact called worker_type_metadata.json with each
                                            task. Providing information here, such as a URL to
                                            the code/config used to set up the worker type will
                                            mean that people running tasks on the worker type
                                            will have more information about how it was set up
                                            (for example what has been installed on the
                                            machine).
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. Useful if not an
                                            administrator, e.g. when running tests. Should not
                                            be used in production! [default: false]
          requiredDiskSpaceMegabytes        The garbage collector will ensure at least this
                                            number of megabytes of disk space are available
                                            when each task starts. If it cannot free enough
                                            disk space, the worker will shut itself down.
                                            [default: 10240]
          shutdownMachineOnInternalError    If true, if the worker encounters an unrecoverable
                                            error (such as not being able to write to a
                                            required file) it will shutdown the host
                                            computer. Note this is generally only desired
                                            for machines running in production, such as on AWS
                                            EC2 spot instances. Use with caution!
                                            [default: false]
          numberOfTasksToRun                If zero, run tasks indefinitely. Otherwise, after
                                            this many tasks, exit. [default: 0]

    Here is an syntactically valid example configuration file:

            {
              "accessToken":                "123bn234bjhgdsjhg234",
              "clientId":                   "hskdjhfasjhdkhdbfoisjd",
              "workerGroup":                "dev-test",
              "workerId":                   "IP_10-134-54-89",
              "workerType":                 "win2008-worker",
              "provisionerId":              "my-provisioner",
              "livelogSecret":              "baNaNa-SouP4tEa",
              "publicIP":                   "12.24.35.46",
              "signingKeyLocation":         "C:\\generic-worker\\generic-worker-gpg-signing-key.key"
            }


    If an optional config setting is not provided in the json configuration file, the
    default will be taken (defaults documented above).

    If no value can be determined for a required config setting, the generic-worker will
    exit with a failure message.

`
)

// Entry point into the generic worker...
func main() {
	arguments, err := docopt.Parse(usage, nil, true, "generic-worker "+version, false, true)
	if err != nil {
		fmt.Println("Error parsing command line arguments!")
		panic(err)
	}

	switch {
	case arguments["show-payload-schema"]:
		fmt.Println(taskPayloadSchema())

	case arguments["run"]:
		configureForAws := arguments["--configure-for-aws"].(bool)
		configFile = arguments["--config"].(string)
		config, err = loadConfig(configFile, configureForAws)
		// persist before checking for error, so we can see what the problem was...
		if config != nil {
			config.persist(configFile)
		}
		if err != nil {
			fmt.Printf("Error loading configuration from file '%v':\n", configFile)
			fmt.Printf("%v\n", err)
			os.Exit(64)
		}
		runWorker()
	case arguments["install"]:
		// platform specific...
		err := install(arguments)
		if err != nil {
			fmt.Println("Error installing generic worker:")
			fmt.Printf("%#v\n", err)
			os.Exit(65)
		}
	case arguments["new-openpgp-keypair"]:
		err := generateOpenPGPKeypair(arguments["--file"].(string))
		if err != nil {
			fmt.Println("Error generating OpenPGP keypair for worker:")
			fmt.Printf("%#v\n", err)
			os.Exit(66)
		}
	}
}

type MissingConfigError struct {
	Setting string
	File    string
}

func (err MissingConfigError) Error() string {
	return "Config setting \"" + err.Setting + "\" must be defined in file \"" + err.File + "\"."
}

func loadConfig(filename string, queryUserData bool) (*Config, error) {
	// TODO: would be better to have a json schema, and also define defaults in
	// only one place if possible (defaults also declared in `usage`)

	// first assign defaults
	c := &Config{
		Subdomain:                      "taskcluster-worker.net",
		ProvisionerID:                  "aws-provisioner-v1",
		LiveLogExecutable:              "livelog",
		RefreshUrlsPrematurelySecs:     310,
		UsersDir:                       "C:\\Users",
		CachesDir:                      "C:\\generic-worker\\caches",
		DownloadsDir:                   "C:\\generic-worker\\downloads",
		CleanUpTaskDirs:                true,
		RunTasksAsCurrentUser:          false,
		IdleShutdownTimeoutSecs:        0,
		RequiredDiskSpaceMegabytes:     10240,
		ShutdownMachineOnInternalError: false,
		NumberOfTasksToRun:             0,
		WorkerTypeMetadata: map[string]interface{}{
			"generic-worker": map[string]string{
				"go-arch":    runtime.GOARCH,
				"go-os":      runtime.GOOS,
				"go-version": runtime.Version(),
				"release":    "https://github.com/taskcluster/generic-worker/releases/tag/v" + version,
				"version":    version,
			},
		},
	}

	configFileBytes, err := ioutil.ReadFile(filename)
	// only overlay values if config file exists and could be read
	if err == nil {
		err = c.mergeInJSON(configFileBytes)
		if err != nil {
			return nil, err
		}
	}

	// now overlay with data from amazon, if applicable
	if queryUserData {
		// don't check errors, since maybe secrets are gone, but maybe we had them already from first run...
		c.updateConfigWithAmazonSettings()
	}

	// now check all required values are set
	// TODO: could probably do this with reflection to avoid explicitly listing
	// all members

	fields := []struct {
		value      interface{}
		name       string
		disallowed interface{}
	}{
		{value: c.ProvisionerID, name: "provisionerId", disallowed: ""},
		{value: c.RefreshUrlsPrematurelySecs, name: "refreshURLsPrematurelySecs", disallowed: 0},
		{value: c.AccessToken, name: "accessToken", disallowed: ""},
		{value: c.ClientID, name: "clientId", disallowed: ""},
		{value: c.WorkerGroup, name: "workerGroup", disallowed: ""},
		{value: c.WorkerID, name: "workerId", disallowed: ""},
		{value: c.WorkerType, name: "workerType", disallowed: ""},
		{value: c.LiveLogExecutable, name: "livelogExecutable", disallowed: ""},
		{value: c.LiveLogSecret, name: "livelogSecret", disallowed: ""},
		{value: c.PublicIP, name: "publicIP", disallowed: net.IP(nil)},
		{value: c.Subdomain, name: "subdomain", disallowed: ""},
		{value: c.UsersDir, name: "usersDir", disallowed: ""},
		{value: c.SigningKeyLocation, name: "signingKeyLocation", disallowed: ""},
	}

	for _, f := range fields {
		if reflect.DeepEqual(f.value, f.disallowed) {
			return c, MissingConfigError{Setting: f.name, File: filename}
		}
	}
	// all required config set!
	return c, nil
}

func runWorker() {
	// Any custom startup per platform...
	err := startup()
	// any errors are fatal
	if err != nil {
		log.Printf("OH NO!!!\n\n%#v", err)
		panic(err)
	}

	// initialise features
	for _, feature := range Features {
		feature.Initialise()
	}

	defer func() {
		if r := recover(); r != nil {
			log.Printf("Shutting down immediately - panic occurred!")
			log.Println(string(debug.Stack()))
			log.Printf("Cause: %#v", r)
			if config.ShutdownMachineOnInternalError {
				immediateShutdown()
			}
		}
	}()
	// Queue is the object we will use for accessing queue api
	Queue = queue.New(
		&tcclient.Credentials{
			ClientID:    config.ClientID,
			AccessToken: config.AccessToken,
			Certificate: config.Certificate,
		},
	)

	// Start the SignedURLsManager in a dedicated go routine, to take care of
	// keeping signed urls up-to-date (i.e. refreshing as old urls expire).
	signedURLsRequestChan, signedURLsResponseChan = SignedURLsManager()

	// loop forever claiming and running tasks!
	lastActive := time.Now()
	tasksResolved := uint(0)
	for {
		// make sure at least 1 second passes between iterations
		waitASec := time.NewTimer(time.Second * 1)
		taskFound := FindAndRunTask()
		if !taskFound {
			log.Println("No task claimed...")
			if config.IdleShutdownTimeoutSecs > 0 {
				idleTime := time.Now().Sub(lastActive)
				if idleTime.Seconds() > float64(config.IdleShutdownTimeoutSecs) {
					if config.ShutdownMachineOnInternalError {
						immediateShutdown()
					}
					break
				}
			}
		} else {
			taskCleanup()
			tasksResolved++
			if tasksResolved == config.NumberOfTasksToRun {
				break
			}
			lastActive = time.Now()
		}
		// To avoid hammering queue, make sure there is at least a second
		// between consecutive requests. Note we do this even if a task ran,
		// since a task could complete in less than a second.
		<-waitASec.C
	}
}

// FindAndRunTask loops through the Azure queues in order, to find a task to
// run. If it finds one, it handles all the bookkeeping, as well as running the
// task. Returns true if it successfully claimed a task (regardless of whether
// the task ran successfully) otherwise false.
func FindAndRunTask() bool {
	// Write to the signed urls channel, to request signed urls back on
	// channel c.
	signedURLsRequestChan <- signedURLsResponseChan
	// Read the result.
	signedURLs := <-signedURLsResponseChan
	taskFound := false
	// Each of these signedURLs represent an underlying Azure queue, there
	// are multiple of these so that we can support priority. For this
	// reason the worker must poll the Azure queues in order they are
	// given.
	for _, urlPair := range signedURLs.Queues {
		// try to grab a task using the url pair (url pair = poll url + delete
		// url)
		task, err := SignedURLPair(urlPair).Poll()
		if err != nil {
			// This can be any error at all occurs in queryAzureQueue that
			// prevents us from claiming this task.  Log, and continue.
			log.Printf("%v", err)
			continue
		}
		if task == nil {
			// no task to run, and logging done in function call, so just
			// continue...
			continue
		}
		// from this point on we should "break" rather than "continue", since
		// there could be more tasks on the same queue - we only "continue"
		// to next queue if we found nothing on this queue...
		taskFound = true
		task.StatusManager = NewTaskStatusManager(task)

		// Now we found a task, run it, and then exit the loop. This is because
		// the loop is in order of priority, most important first, so we will
		// run the most important task we find, and then return, ignorning
		// remaining urls for lower priority tasks that might still be left to
		// loop through, since by the time we complete the first task, maybe
		// higher priority jobs are waiting, so we need to poll afresh.
		log.Println("Task found")
		execErr := task.run()
		if execErr.Occurred() {
			task.reportPossibleError(execErr)
		}
		break
	}
	return taskFound
}

func (task *TaskRun) reportPossibleError(err error) {
	if err != nil {
		log.Printf("ERROR encountered: %v", err)
		task.Log(err.Error())
	}
}

// Queries the given Azure Queue signed url pair (poll url/delete url) and
// translates the Azure response into a Task object
func (urlPair SignedURLPair) Poll() (*TaskRun, error) {
	queueMessagesList := new(QueueMessagesList)
	// To poll an Azure Queue the worker must do a `GET` request to the
	// `signedPollUrl` from the object, representing the Azure queue. To
	// receive multiple messages at once the parameter `&numofmessages=N`
	// may be appended to `signedPollUrl`. The parameter `N` is the
	// maximum number of messages desired, `N` can be up to 32.
	// Since we can only process one task at a time, grab only one.
	resp, _, err := httpbackoff.Get(urlPair.SignedPollURL + "&numofmessages=1")
	if err != nil {
		log.Printf("%v", err)
		return nil, err
	}
	// When executing a `GET` request to `signedPollUrl` from an Azure queue object,
	// the request will return an XML document on the form:
	//
	// ```xml
	// <QueueMessagesList>
	//     <QueueMessage>
	//       <MessageId>...</MessageId>
	//       <InsertionTime>...</InsertionTime>
	//       <ExpirationTime>...</ExpirationTime>
	//       <PopReceipt>...</PopReceipt>
	//       <TimeNextVisible>...</TimeNextVisible>
	//       <DequeueCount>...</DequeueCount>
	//       <MessageText>...</MessageText>
	//     </QueueMessage>
	//     ...
	// </QueueMessagesList>
	// ```
	// We unmarshal the response into go objects, using the go xml decoder.
	fullBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	reader := strings.NewReader(string(fullBody))
	dec := xml.NewDecoder(reader)
	err = dec.Decode(&queueMessagesList)
	if err != nil {
		log.Println("ERROR: not able to xml decode the response from the azure Queue:")
		log.Println(string(fullBody))
		return nil, err
	}
	if len(queueMessagesList.QueueMessages) == 0 {
		log.Println("Zero tasks returned in Azure XML QueueMessagesList")
		return nil, nil
	}
	if size := len(queueMessagesList.QueueMessages); size > 1 {
		return nil, fmt.Errorf("%v tasks returned in Azure XML QueueMessagesList, even though &numofmessages=1 was specified in poll url", size)
	}

	// at this point we know there is precisely one QueueMessage (== task)
	qm := queueMessagesList.QueueMessages[0]

	// Utility method for replacing a placeholder within a uri with
	// a string value which first must be uri encoded...
	detokeniseUri := func(uri, placeholder, rawValue string) string {
		return strings.Replace(uri, placeholder, strings.Replace(url.QueryEscape(rawValue), "+", "%20", -1), -1)
	}

	// Before using the signedDeleteUrl the worker must replace the placeholder
	// {{messageId}} with the contents of the <MessageId> tag. It is also
	// necessary to replace the placeholder {{popReceipt}} with the URI encoded
	// contents of the <PopReceipt> tag.  Notice, that the worker must URI
	// encode the contents of <PopReceipt> before substituting into the
	// signedDeleteUrl. Otherwise, the worker will experience intermittent
	// failures.

	// Since urlPair is a value, not a pointer, we can update this copy which
	// is associated only with this particular task
	urlPair.SignedDeleteURL = detokeniseUri(
		detokeniseUri(
			urlPair.SignedDeleteURL,
			"{{messageId}}",
			qm.MessageId,
		),
		"{{popReceipt}}",
		qm.PopReceipt,
	)

	// Workers should read the value of the `<DequeueCount>` and log messages
	// that alert the operator if a message has been dequeued a significant
	// number of times, for example 15 or more.
	if qm.DequeueCount >= 15 {
		log.Printf("WARN: Queue Message with message id %v has been dequeued %v times!", qm.MessageId, qm.DequeueCount)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteURL)
		if deleteErr != nil {
			log.Println("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteURL)
			log.Printf("%v", deleteErr)
		}
	}

	// To find the task referenced in a message the worker must base64
	// decode and JSON parse the contents of the <MessageText> tag. This
	// would return an object on the form: {taskId, runId}.
	m, err := base64.StdEncoding.DecodeString(qm.MessageText)
	if err != nil {
		// try to delete from Azure, if it fails, nothing we can do about it
		// not very serious - another worker will try to delete it
		log.Println("ERROR: Not able to base64 decode the Message Text '" + qm.MessageText + "' in Azure QueueMessage response.")
		log.Println("Deleting from Azure queue as other workers will have the same problem.")
		deleteErr := deleteFromAzure(urlPair.SignedDeleteURL)
		if deleteErr != nil {
			log.Println("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteURL)
			log.Printf("%v", deleteErr)
		}
		return nil, err
	}

	// initialise fields of TaskRun not contained in json string m
	taskRun := TaskRun{
		QueueMessage:  qm,
		SignedURLPair: urlPair,
		Status:        unclaimed,
	}

	// now populate remaining json fields of TaskRun from json string m
	err = json.Unmarshal(m, &taskRun)
	if err != nil {
		log.Printf("Not able to unmarshal json from base64 decoded MessageText '%v'", m)
		log.Printf("%v", err)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteURL)
		if deleteErr != nil {
			log.Println("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteURL)
			log.Printf("%v", deleteErr)
		}
		return nil, err
	}

	return &taskRun, nil
}

// deleteFromAzure will attempt to delete a task from the Azure queue and
// return an error in case of failure
func (task *TaskRun) deleteFromAzure() error {
	if task == nil {
		return fmt.Errorf("Cannot delete task from Azure - task is nil")
	}
	log.Println("Deleting task " + task.TaskID + " from Azure queue...")
	return deleteFromAzure(task.SignedURLPair.SignedDeleteURL)
}

// deleteFromAzure is a wrapper around calling an Azure delete URL with error
// handling in case of failure
func deleteFromAzure(deleteUrl string) error {

	// Messages are deleted from the Azure queue with a DELETE request to the
	// signedDeleteUrl from the Azure queue object returned from
	// queue.pollTaskUrls.

	// Also remark that the worker must delete messages if the queue.claimTask
	// operations fails with a 4xx error. A 400 hundred range error implies
	// that the task wasn't created, not scheduled or already claimed, in
	// either case the worker should delete the message as we don't want
	// another worker to receive message later.

	httpCall := func() (*http.Response, error, error) {
		req, err := http.NewRequest("DELETE", deleteUrl, nil)
		if err != nil {
			return nil, nil, err
		}
		resp, err := http.DefaultClient.Do(req)
		return resp, err, nil
	}

	resp, _, err := httpbackoff.Retry(httpCall)

	// Notice, that failure to delete messages from Azure queue is serious, as
	// it wouldn't manifest itself in an immediate bug. Instead if messages
	// repeatedly fails to be deleted, it would result in a lot of unnecessary
	// calls to the queue and the Azure queue. The worker will likely continue
	// to work, as the messages eventually disappears when their deadline is
	// reached. However, the provisioner would over-provision aggressively as
	// it would be unable to tell the number of pending tasks. And the worker
	// would spend a lot of time attempting to claim faulty messages. For these
	// reasons outlined above it's strongly advised that workers logs failures
	// to delete messages from Azure queues.
	if err != nil {
		log.Printf("Not able to delete task from azure queue (delete url: %v)", deleteUrl)
		log.Printf("%v", err)
		return err
	}
	log.Printf("Successfully deleted task from azure queue (delete url: %v) with http response code %v.", deleteUrl, resp.StatusCode)
	// no errors occurred, yay!
	return nil
}

func (task *TaskRun) setReclaimTimer() {
	// Reclaiming Tasks
	// ----------------
	// When the worker has claimed a task, it's said to have a claim to a given
	// `taskId`/`runId`. This claim has an expiration, see the `takenUntil`
	// property in the _task status structure_ returned from `queue.claimTask`
	// and `queue.reclaimTask`. A worker must call `queue.reclaimTask` before
	// the claim denoted in `takenUntil` expires. It's recommended that this
	// attempted a few minutes prior to expiration, to allow for clock drift.

	// First time we need to check claim response, after that, need to check reclaim response
	log.Println("Setting reclaim timer...")
	var takenUntil time.Time
	if len(task.TaskReclaimResponse.Status.Runs) > 0 {
		takenUntil = time.Time(task.TaskReclaimResponse.Status.Runs[task.RunID].TakenUntil)
	} else {
		takenUntil = time.Time(task.TaskClaimResponse.Status.Runs[task.RunID].TakenUntil)
	}
	log.Printf("Current claim will expire at %v", takenUntil)

	// Attempt to reclaim 3 mins earlier...
	reclaimTime := takenUntil.Add(time.Minute * -3)
	log.Printf("Reclaiming 3 mins earlier, at %v", reclaimTime)
	waitTimeUntilReclaim := reclaimTime.Sub(time.Now())
	log.Printf("Time to wait until then is %v", waitTimeUntilReclaim)
	// sanity check - only set an alarm, if wait time > 30s, so we can't hammer queue
	if waitTimeUntilReclaim.Seconds() > 30 {
		log.Println("This is more than 30 seconds away - so setting a timer")
		task.reclaimTimer = time.AfterFunc(
			waitTimeUntilReclaim, func() {
				err := task.StatusManager.Reclaim()
				if err == nil {
					// only set another reclaim timer if the previous reclaim succeeded
					task.setReclaimTimer()
				} else {
					log.Printf("Encountered exception when reclaiming task %v: %v", task.TaskID, err)
					log.Printf("Killing task %v since I cannot reclaim it", task.TaskID)
					task.Logf("Killing process since task reclaim resulted in exception: %v", err)
					task.kill()
				}
			},
		)
	} else {
		log.Println("WARNING ******************** This is NOT more than 30 seconds away - so NOT setting a timer")
	}
}

func (task *TaskRun) fetchTaskDefinition() {
	// Fetch task definition
	task.Definition = task.TaskClaimResponse.Task
}

func (task *TaskRun) validatePayload() *CommandExecutionError {
	jsonPayload := task.Definition.Payload
	log.Printf("JSON payload: %s", jsonPayload)
	schemaLoader := gojsonschema.NewStringLoader(taskPayloadSchema())
	docLoader := gojsonschema.NewStringLoader(string(jsonPayload))
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	if err != nil {
		return MalformedPayloadError(err)
	}
	if !result.Valid() {
		task.Log("TASK FAIL since the task payload is invalid. See errors:")
		for _, desc := range result.Errors() {
			task.Logf("- %s", desc)
		}
		// Dealing with Invalid Task Payloads
		// ----------------------------------
		// If the task payload is malformed or invalid, keep in mind that the
		// queue doesn't validate the contents of the `task.payload` property,
		// the worker may resolve the current run by reporting an exception.
		// When reporting an exception, using `queue.reportException` the
		// worker should give a `reason`. If the worker is unable execute the
		// task specific payload/code/logic, it should report exception with
		// the reason `malformed-payload`.
		//
		// This can also be used if an external resource that is referenced in
		// a declarative nature doesn't exist. Generally, it should be used if
		// we can be certain that another run of the task will have the same
		// result. This differs from `queue.reportFailed` in the sense that we
		// report a failure if the task specific code failed.
		//
		// Most tasks includes a lot of declarative steps, such as poll a
		// docker image, create cache folder, decrypt encrypted environment
		// variables, set environment variables and etc. Clearly, if decryption
		// of environment variables fail, there is no reason to retry the task.
		// Nor can it be said that the task failed, because the error wasn't
		// cause by execution of Turing complete code.
		//
		// If however, we run some executable code referenced in `task.payload`
		// and the code crashes or exists non-zero, then the task is said to be
		// failed. The difference is whether or not the unexpected behavior
		// happened before or after the execution of task specific Turing
		// complete code.
		return MalformedPayloadError(fmt.Errorf("Validation of payload failed for task %v", task.TaskID))
	}
	err = json.Unmarshal(jsonPayload, &task.Payload)
	if err != nil {
		return MalformedPayloadError(err)
	}
	for _, artifact := range task.Payload.Artifacts {
		if time.Time(artifact.Expires).Before(time.Time(task.Definition.Deadline)) {
			return MalformedPayloadError(errors.New("Malformed payload: artifact expiration before task deadline"))
		}
	}
	return nil
}

type CommandExecutionError struct {
	TaskStatus TaskStatus
	Cause      error
	Reason     TaskUpdateReason
}

func executionError(reason TaskUpdateReason, status TaskStatus, err error) *CommandExecutionError {
	if err == nil {
		return nil
	}
	return &CommandExecutionError{
		Cause:      err,
		Reason:     reason,
		TaskStatus: status,
	}
}

func ResourceUnavailable(err error) *CommandExecutionError {
	return executionError("resource-unavailable", errored, err)
}

func MalformedPayloadError(err error) *CommandExecutionError {
	return executionError("malformed-payload", errored, err)
}

func Failure(err error) *CommandExecutionError {
	return executionError("", failed, err)
}

func (task *TaskRun) Logf(format string, v ...interface{}) {
	task.Log(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Log(message string) {
	if task.logWriter != nil {
		for _, line := range strings.Split(message, "\n") {
			task.logWriter.Write([]byte("[taskcluster " + tcclient.Time(time.Now()).String() + "] " + line + "\n"))
		}
	}
}

func (err *CommandExecutionError) Error() string {
	return fmt.Sprintf("%v", err.Cause)
}

func (c *Command) Start() error {
	c.Lock()
	defer c.Unlock()
	return c.osCommand.Start()
}

func (task *TaskRun) ExecuteCommand(index int) *CommandExecutionError {

	task.Log("Executing command " + strconv.Itoa(index) + ": " + task.describeCommand(index))
	task.prepareCommand(index)
	err := task.Commands[index].Start()
	if err != nil {
		panic(err)
	}

	log.Println("Waiting for command to finish...")
	errCommand := task.Commands[index].osCommand.Wait()
	exitStatus := 0
	if errCommand != nil {
		if exiterr, ok := errCommand.(*exec.ExitError); ok {
			// The program has exited with an exit code != 0

			// This works on both Unix and Windows. Although package
			// syscall is generally platform dependent, WaitStatus is
			// defined for both Unix and Windows and in both cases has
			// an ExitStatus() method with the same signature.
			if status, ok := exiterr.Sys().(syscall.WaitStatus); ok {
				exitStatus = status.ExitStatus()
			}
		}
	}
	task.Log("Exit Code: " + strconv.Itoa(exitStatus))

	if errCommand != nil {
		return exceptionOrFailure(errCommand)
	}
	return nil
}

func (task *TaskRun) claim() (err *CommandExecutionError) {
	// If there is one or more messages the worker must claim the tasks
	// referenced in the messages, and delete the messages.
	e := task.StatusManager.Claim()
	if e != nil {
		return ResourceUnavailable(fmt.Errorf("Not able to claim task %v due to %v", task.TaskID, e))
	}
	return nil
}

type executionErrors []*CommandExecutionError

func (e *executionErrors) add(err *CommandExecutionError) {
	if err == nil {
		return
	}
	if e == nil {
		*e = executionErrors{err}
	} else {
		*e = append(*e, err)
	}
}

func (err *executionErrors) Error() string {
	if !err.Occurred() {
		return ""
	}
	text := "Task not successful due to following exception(s):\n"
	for i, e := range *err {
		text += fmt.Sprintf("Exception %v)\n%v\n", i+1, e)
	}
	return text
}

func (err *executionErrors) Occurred() bool {
	return len(*err) > 0
}

func (task *TaskRun) resolve(e *executionErrors) *CommandExecutionError {
	log.Println("Resolving task...")
	if !e.Occurred() {
		return ResourceUnavailable(task.StatusManager.ReportCompleted())
	}
	if (*e)[0].TaskStatus == failed {
		return ResourceUnavailable(task.StatusManager.ReportFailed())
	}
	return ResourceUnavailable(task.StatusManager.ReportException((*e)[0].Reason))
}

func (task *TaskRun) setMaxRunTimer() {
	// Terminating the Worker Early
	// ----------------------------
	// If the worker finds itself having to terminate early, for example a spot
	// nodes that detects pending termination. Or a physical machine ordered to
	// be provisioned for another purpose, the worker should report exception
	// with the reason `worker-shutdown`. Upon such report the queue will
	// resolve the run as exception and create a new run, if the task has
	// additional retries left.
	go func() {
		time.Sleep(time.Second * time.Duration(task.Payload.MaxRunTime))
		// ignore any error - in the wrong go routine to properly handle it
		task.StatusManager.Abort()
	}()
}

func (task *TaskRun) kill() {
	for index := range task.Commands {
		task.abortProcess(&task.Commands[index])
	}
}

func (task *TaskRun) createLogFile() io.WriteCloser {
	absLogFile := filepath.Join(TaskUser.HomeDir, "public", "logs", "live_backing.log")
	logFileHandle, err := os.Create(absLogFile)
	if err != nil {
		panic(err)
	}
	task.logWriter = logFileHandle
	return logFileHandle
}

func (task *TaskRun) logHeader() {
	jsonBytes, err := json.MarshalIndent(config.WorkerTypeMetadata, "  ", "  ")
	if err != nil {
		panic(err)
	}
	task.Log("Worker Type (" + config.WorkerType + ") settings:")
	task.Log("  " + string(jsonBytes))
	task.Log("=== Task Starting ===")
}

func (task *TaskRun) run() (err *executionErrors) {

	// err is essentially a list of all errors that occur. We'll base the task
	// resolution on the first error that occurs. The err.add(<error-or-nil>)
	// function is a simple way of adding an error to the list, if one occurs,
	// otherwise not adding it, if it is nil

	// note, since we return the value pointed to by `err`, we can continue
	// to manipulate `err` even in defer statements, and this will affect
	// return value of this method.

	err = &executionErrors{}

	err.add(task.claim())
	if err.Occurred() {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			err.add(executionError("worker-shutdown", errored, fmt.Errorf("%#v", r)))
			defer panic(r)
		}
		err.add(task.resolve(err))
	}()

	task.setReclaimTimer()
	task.fetchTaskDefinition()

	logHandle := task.createLogFile()
	defer func() {
		// log any errors that occurred
		if err.Occurred() {
			task.Log(err.Error())
		}
		if r := recover(); r != nil {
			task.Log(string(debug.Stack()))
			task.Logf("%#v", r)
			defer panic(r)
		}
		task.closeLog(logHandle)
		err.add(task.uploadLog("public/logs/live_backing.log"))
	}()

	err.add(task.validatePayload())
	if err.Occurred() {
		return
	}
	log.Printf("Running task https://tools.taskcluster.net/task-inspector/#%v/%v", task.TaskID, task.RunID)

	task.Commands = make([]Command, len(task.Payload.Command))
	// generate commands, in case features want to modify them
	for i, _ := range task.Payload.Command {
		err := task.generateCommand(i) // platform specific
		if err != nil {
			panic(err)
		}
	}

	taskFeatures := []TaskFeature{}

	// create task features
	for _, feature := range Features {
		if feature.IsEnabled(task.Payload.Features) {
			taskFeature := feature.NewTaskFeature(task)
			requiredScopes := taskFeature.RequiredScopes()
			scopesSatisfied, scopeValidationErr := scopes.Given(task.Definition.Scopes).Satisfies(requiredScopes, auth.New(nil))
			if scopeValidationErr != nil {
				// presumably we couldn't expand assume:* scopes due to auth
				// service unavailability
				err.add(ResourceUnavailable(scopeValidationErr))
				continue
			}
			if !scopesSatisfied {
				err.add(MalformedPayloadError(fmt.Errorf("Feature %q requires scopes:\n\n%v\n\nbut task only has scopes:\n\n%v\n\nYou probably should add some scopes to your task definition.", feature.Name(), requiredScopes, scopes.Given(task.Definition.Scopes))))
				continue
			}
			taskFeatures = append(taskFeatures, taskFeature)
		}
	}
	if err.Occurred() {
		return
	}

	// start task features
	for _, taskFeature := range taskFeatures {
		err.add(taskFeature.Start())
		if err.Occurred() {
			return
		}
		defer func(taskFeature TaskFeature) {
			err.add(taskFeature.Stop())
		}(taskFeature)
	}

	defer func() {
		for _, artifact := range task.PayloadArtifacts() {
			err.add(task.uploadArtifact(artifact))
		}
	}()

	task.logHeader()
	task.setMaxRunTimer()

	started := time.Now()

	for i, _ := range task.Payload.Command {
		err.add(task.ExecuteCommand(i))
		if err.Occurred() {
			return
		}
	}

	finished := time.Now()
	task.Log("=== Task Finished ===")
	task.Log("Task Duration: " + finished.Sub(started).String())

	return
}

func writeToFileAsJSON(obj interface{}, filename string) error {
	jsonBytes, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	log.Printf("Saving generic worker config in file %v with content:\n%v\n", filename, string(jsonBytes))
	return ioutil.WriteFile(filename, append(jsonBytes, '\n'), 0644)
}

func (task *TaskRun) closeLog(logHandle io.WriteCloser) {
	err := logHandle.Close()
	if err != nil {
		panic(err)
	}
}

func (task *TaskRun) uploadBackingLog() *CommandExecutionError {
	log.Println("Uploading full log file")
	err := task.uploadLog("public/logs/live_backing.log")
	if err != nil {
		return ResourceUnavailable(err)
	}

	return nil
}

// writes config to json file
func (c *Config) persist(file string) error {
	fmt.Println("Worker ID: " + c.WorkerID)
	fmt.Println("Creating file " + file + "...")
	return writeToFileAsJSON(c, file)
}

func convertNilToEmptyString(val interface{}) string {
	if val == nil {
		return ""
	}
	return val.(string)
}
