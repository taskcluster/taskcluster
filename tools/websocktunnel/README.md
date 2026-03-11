# Websocktunnel

Websocktunnel is a service that allows its clients to publicly expose specific HTTP services without publicly exposing the entire host.

See https://docs.taskcluster.net/docs/reference/workers/websocktunnel for documentation on the service itself.

## Development

To hack on this service, follow the instructions in the `dev-docs` directory of this repository.

## Using a local websocktunnel with an existing Taskcluster deployment

You can test websocktunnel with an existing Taskcluster deployment by running your own websocktunnel process, and your own worker which points at it. There are some caveats:
* You will need to patch websocktunnel to accept any auth (because you most likely do not have access to the correct secret)
* Links provided by the existing deployment's UI will not work (you'll need to pull the links out of your worker logs instead)

For the former, you can return early from the `validateJWT` method, eg:
```
index 3153ab63f..b2e679230 100644
--- a/tools/websocktunnel/wsproxy/proxy.go
+++ b/tools/websocktunnel/wsproxy/proxy.go
@@ -327,16 +327,18 @@ func (p *proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string,
 	wf := &threadSafeWriteFlusher{w: w, f: flusher}
 	n, err := copyAndFlush(wf, resp.Body, 100*time.Millisecond)
 	p.logf(id, r.RemoteAddr, "data transfered over request: %d bytes, error: %v", n, err)
 }

 // validate jwt
 // jwt signing and verification algorithm must be HMAC
 func (p *proxy) validateJWT(id string, tokenString string) error {
+	return nil;
+
 	// parse jwt token
 	// default parser verifies iat token if present. This can be a problem because of clocks not being
 	// in sync.
 	parser := &jwt.Parser{
 		ValidMethods:         []string{"HS256"},
 		SkipClaimsValidation: true, // Claims will be verified if token can be decoded using secret
 	}

```

For the latter, a patch like this to generic-worker is recommended:
```
diff --git a/workers/generic-worker/artifacts.go b/workers/generic-worker/artifacts.go
index 51bd3eb8f..b3efac30f 100644
--- a/workers/generic-worker/artifacts.go
+++ b/workers/generic-worker/artifacts.go
@@ -280,16 +280,17 @@ func (task *TaskRun) uploadLog(name, path string) *CommandExecutionError {

 func (task *TaskRun) uploadArtifact(artifact artifacts.TaskArtifact) *CommandExecutionError {
 	task.Artifacts[artifact.Base().Name] = artifact
 	payload, err := json.Marshal(artifact.RequestObject())
 	if err != nil {
 		panic(err)
 	}
 	par := tcqueue.PostArtifactRequest(json.RawMessage(payload))
+	log.Print(string(payload));
 	task.queueMux.RLock()
 	parsp, err := task.Queue.CreateArtifact(
 		task.TaskID,
 		strconv.Itoa(int(task.RunID)),
 		artifact.Base().Name,
 		&par,
 	)
 	task.queueMux.RUnlock()
```

With that applied you should messages similar to the following when a task begins to execute on your worker:
```
2024/01/12 20:19:36Z {"contentType":"text/plain; charset=utf-8","expires":"2024-01-12T21:34:36.541Z","storageType":"reference","url":"http://localhost:1080/test-worker-group.bhearsum.60099/log/GiOHKockQCK57rBYmo2ntA"}
```
