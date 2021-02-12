/*!
# Taskcluster Client for Rust

For a general guide to using Taskcluster clients, see [Calling Taskcluster
APIs](https://docs.taskcluster.net/docs/manual/using/api).

This client is a convenience wrapper around `reqwest` that provides named functions for each API
endpoint and adds functionality such as authentication and retries.

# Usage

## Setup

Before calling an API end-point, you'll need to build a client, using the
[`ClientBuilder`](crate::ClientBuilder) type.   This allows construction of a client with only the
necessary features, following the builder pattern.  You must at least supply a root URL to identify
the Taskcluster deployment to which the API calls should be directed.

There is a type for each service, e.g., [`Queue`](crate::Queue) and [`Auth`](crate::Auth).  Each service type defines functions
spepcific to the API endpoints for that service.  Each has a `new` associated function that
takes an `Into<ClientBuilder>`. As a shortcut, you may pass a string to `new` that will be treated
as a root URL.

Here is a simple setup and use of an un-authenticated client:

```
# use httptest::{matchers::*, responders::*, Expectation, Server};
# use tokio;
# use anyhow::Result;
# use serde_json::json;
# #[tokio::main]
# async fn main() -> Result<()> {
# let server = Server::run();
# server.expect(
#    Expectation::matching(request::method_path("GET", "/api/auth/v1/clients/static%2Ftaskcluster%2Froot"))
#   .respond_with(
#       status_code(200)
#       .append_header("Content-Type", "application/json")
#       .body("{\"clientId\": \"static/taskcluster/root\"}"))
# );
# let root_url = format!("http://{}", server.addr());
use taskcluster::Auth;
let auth = Auth::new(root_url)?;
let resp = auth.client("static/taskcluster/root").await?;
assert_eq!(resp, json!({"clientId": "static/taskcluster/root"}));
Ok(())
# }
```

Here is an example with credentials provided, in this case via the [standard environment variables](https://docs.taskcluster.net/docs/manual/design/env-vars).

```
# use httptest::{matchers::*, responders::*, Expectation, Server};
# use tokio;
use std::env;
# use anyhow::Result;
# #[tokio::main]
# async fn main() -> Result<()> {
# let server = Server::run();
# server.expect(
#    Expectation::matching(request::method_path("POST", "/api/queue/v1/task/G08bnnBuR6yDhDLJkJ6KiA/cancel"))
#   .respond_with(
#       status_code(200)
#       .append_header("Content-Type", "application/json")
#       .body("{\"status\": \"...\"}"))
# );
# env::set_var("TASKCLUSTER_ROOT_URL", format!("http://{}", server.addr()));
# env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
# env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
use taskcluster::{ClientBuilder, Queue, Credentials};
let creds = Credentials::from_env()?;
let root_url = env::var("TASKCLUSTER_ROOT_URL").unwrap();
let client = Queue::new(ClientBuilder::new(&root_url).credentials(creds))?;
let res = client.cancelTask("G08bnnBuR6yDhDLJkJ6KiA").await?;
println!("{}", res.get("status").unwrap());
Ok(())
# }
```

### Authorized Scopes

If you wish to perform requests on behalf of a third-party that has smaller set
of scopes than you do, you can specify [which scopes your request should be
allowed to
use](https://docs.taskcluster.net/docs/manual/design/apis/hawk/authorized-scopes).

These "authorized scopes" are configured on the client:

```
# use httptest::{matchers::*, responders::*, Expectation, Server};
# use tokio;
use std::env;
use serde_json::json;
# use anyhow::Result;
# #[tokio::main]
# async fn main() -> Result<()> {
# let server = Server::run();
# server.expect(
#    Expectation::matching(request::method_path("PUT", "/api/queue/v1/task/G08bnnBuR6yDhDLJkJ6KiA"))
#   .respond_with(
#       status_code(200)
#       .append_header("Content-Type", "application/json")
#       .body("{\"taskId\": \"...\"}"))
# );
# env::set_var("TASKCLUSTER_ROOT_URL", format!("http://{}", server.addr()));
# env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
# env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
use taskcluster::{ClientBuilder, Queue, Credentials};
let creds = Credentials::from_env()?;
let root_url = env::var("TASKCLUSTER_ROOT_URL").unwrap();
let client = Queue::new(
    ClientBuilder::new(&root_url)
        .credentials(creds)
        .authorized_scopes(vec!["just:one-scope"]))?;
# let task = json!({});
let res = client.createTask("G08bnnBuR6yDhDLJkJ6KiA", &task).await?;
Ok(())
# }
```

## Calling API Methods

API methods are available as methods on the corresponding client object.  They are capitalized in
snakeCase (e.g., `createTask`) to match the Taskcluster documentation.

Each method takes arguments in the following order, where appropriate to the method:
 * Positional arguments (strings interpolated into the URL)
 * Request body (payload)
 * URL query arguments

The payload comes in the form of a `serde_json::Value`, the contents of which should match the API
method's input schema.  URL query arguments are all optional.

For example, the following lists all Auth clients:

```
# // note: pagination is more thoroughly tested in `tests/against_real_deployment.rs`
# use httptest::{matchers::*, responders::*, Expectation, Server};
# use tokio;
# use std::env;
# use anyhow::Result;
# #[tokio::main]
# async fn main() -> Result<()> {
# let server = Server::run();
# server.expect(
#    Expectation::matching(request::method_path("GET", "/api/auth/v1/clients/"))
#   .respond_with(
#       status_code(200)
#       .append_header("Content-Type", "application/json")
#       .body("{\"clients\": []}"))
# );
# let root_url = format!("http://{}", server.addr());
use taskcluster::{Auth, ClientBuilder, Credentials};
let auth = Auth::new(ClientBuilder::new(&root_url))?;
let mut continuation_token: Option<String> = None;
let limit = Some("10");

loop {
    let res = auth
        .listClients(None, continuation_token.as_deref(), limit)
        .await?;
    for client in res.get("clients").unwrap().as_array().unwrap() {
        println!("{:?}", client);
    }
    if let Some(v) = res.get("continuationToken") {
        continuation_token = Some(v.as_str().unwrap().to_owned());
    } else {
        break;
    }
}
# Ok(())
# }
```

### Error Handling

All 5xx (server error) responses are automatically retried.
All 4xx (client error) responses are converted to `Result::Err`.
All other responses are treated as successful responses.
Note that this includes 3xx (redirection) responses; the client does not automatically follow such redirects.

Client methods return `anyhow::Error`, but this can be downcast to a `reqwest::Error` if needed.
As a shortcut for the common case of getting the HTTP status code for an error, use [`err_status_code`](crate::err_status_code).
The `reqwest::StatusCode` type that this returns is re-exported from this crate.

### Low-Level Access

Instead of using service-specific types, it is possible to call API methods directly by path, using
the [`Client`](crate::Client) type:

```
# use httptest::{matchers::*, responders::*, Expectation, Server};
# use tokio;
use std::env;
# use anyhow::Result;
# #[tokio::main]
# async fn main() -> Result<()> {
# let server = Server::run();
# server.expect(
#    Expectation::matching(request::method_path("POST", "/api/queue/v1/task/G08bnnBuR6yDhDLJkJ6KiA/cancel"))
#   .respond_with(status_code(200))
# );
# env::set_var("TASKCLUSTER_ROOT_URL", format!("http://{}", server.addr()));
# env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
# env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
use taskcluster::{ClientBuilder, Credentials};
let creds = Credentials::from_env()?;
let root_url = env::var("TASKCLUSTER_ROOT_URL").unwrap();
let client = ClientBuilder::new(&root_url).credentials(creds).build()?;
let resp = client.request("POST", "api/queue/v1/task/G08bnnBuR6yDhDLJkJ6KiA/cancel", None, None).await?;
assert!(resp.status().is_success());
# Ok(())
# }
```

## Uploading Objects

This crate contains dedicated support for resilient uploads and downloads to/from the Taskcluster object service.
This comes in the form of functions that will both interface with the object service API and perform the negotiated upload/download method.
In all cases, you must supply a pre-configured [`Object`](crate::Object) client, as well as required parameters to the object service API methods.

The following convenience functions cover the common cases:

* [`upload_to_buf`](crate::upload_to_buf) - upload from an in-memory buffer
* [`upload_to_file`](crate::upload_to_file) - upload from an on-disk file
* [`download_to_vec`](crate::download_to_vec) - download to a dynamically sized buffer
* [`download_to_buf`](crate::download_to_buf) - download to a fixed-sized buffer
* [`download_to_file`](crate::download_to_file) - download to a file

For more complex cases, see the [`upload`](crate::upload) and [`download`](crate::download) modules.

## Generating URLs

To generate a unsigned URL for an API method, use `<method>_url`:

```
# use anyhow::Result;
# fn main() -> Result<()> {
use taskcluster::{Auth, ClientBuilder};
# use std::env;
# env::set_var("TASKCLUSTER_ROOT_URL", "https://tc-tests.example.com");
let root_url = env::var("TASKCLUSTER_ROOT_URL").unwrap();
let auth = Auth::new(ClientBuilder::new(&root_url))?;
let url = auth.listClients_url(Some("static/"), None, None)?;
assert_eq!(url, "https://tc-tests.example.com/api/auth/v1/clients/?prefix=static%2F".to_owned());
# Ok(())
# }
```

## Generating Temporary Credentials

The [`create_named_temp_creds`](crate::Credentials::create_named_temp_creds) method creates
temporary credentials:

```
use std::env;
use std::time::Duration;
# use anyhow::Result;
# fn main() -> Result<()> {
# env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
# env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
use taskcluster::Credentials;
let creds = Credentials::from_env()?;
let temp_creds = creds.create_named_temp_creds(
    "new-client-id",
    Duration::from_secs(3600),
    vec!["scope1", "scope2"])?;
assert_eq!(temp_creds.client_id, "new-client-id");
# Ok(())
# }
```

There is also a `create_temp_creds` method which creates unamed temporary credentials, but its use
is not recommended.

## Generating Timestamps

Taskcluster APIs expects ISO 8601 timestamps, of the sort generated by the JS `Date.toJSON` method.
The [`chrono`](https://docs.rs/chrono/) crate supports generating compatible timestamps if included with the `serde` feature.
This crate re-exports `chrono` with that feature enabled.
To duplicate the functionality of the `fromNow` function from other Taskcluster client libraries, use something like this:

```
use taskcluster::chrono::{DateTime, Utc, Duration};
use serde_json::json;

let expires = Utc::now() + Duration::days(2);
let json = json!({ "expires": expires });
```

## Generating SlugIDs

Use the [slugid](https://crates.io/crates/slugid) crate to create slugIds (such as for a taskId).

*/

mod client;
mod credentials;
pub mod download;
mod generated;
pub mod upload;
mod util;

#[cfg(test)]
mod test;

// re-export
pub use chrono;

// internal re-exports
pub use client::{Client, ClientBuilder, Retry};
pub use credentials::Credentials;
pub use generated::*;
pub use reqwest::StatusCode;
pub use util::err_status_code;

pub use download::{download_to_buf, download_to_file, download_to_vec};
pub use upload::{upload_from_buf, upload_from_file};
