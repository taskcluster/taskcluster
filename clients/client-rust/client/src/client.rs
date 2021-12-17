use crate::retry::Backoff;
use crate::util::collect_scopes;
use crate::{Credentials, Retry};
use anyhow::{anyhow, bail, Context, Error, Result};
use reqwest::header::HeaderValue;
use serde_json::json;
use serde_json::Value;
use std::iter::IntoIterator;
use std::str::FromStr;
use std::time::Duration;

/// ClientBuilder implements the builder pattern for building a Client, allowing
/// optional configuration of features such as authorized scopes and retry.
#[derive(Default, Debug, Clone)]
pub struct ClientBuilder {
    root_url: String,
    retry: Retry,
    credentials: Option<Credentials>,
    path_prefix: Option<String>,
    authorized_scopes: Option<Vec<String>>,
    timeout: Duration,
}

impl ClientBuilder {
    /// Create a new ClientBuilder.  The Taskcluster root URL is required and so must always be
    /// specified.
    pub fn new<S: Into<String>>(root_url: S) -> Self {
        Self {
            root_url: root_url.into(),
            timeout: Duration::from_secs(30),
            ..Self::default()
        }
    }

    /// Add credentials to the client
    pub fn credentials(mut self, credentials: Credentials) -> Self {
        self.credentials = Some(credentials);
        self
    }

    /// Set the retry configuration for the client
    pub fn retry(mut self, retry: Retry) -> Self {
        self.retry = retry;
        self
    }

    /// Set the timeout for each HTTP request made by the client.  The default is
    /// 30 seconds.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the path_prefix; this will be included between the root URL and the path given to
    /// `request`, `make_url`, and `make_signed_url`.  This is typically used when building a
    /// client that will address a single service, such as `api/queue/v1/`.  The path prefix
    /// must not start with `/` and must end with a `/` character.  This is only for internal
    /// use in constructing service-specific clients that will always use the same path prefix.
    pub(crate) fn path_prefix<S: Into<String>>(mut self, path_prefix: S) -> Self {
        let path_prefix = path_prefix.into();
        debug_assert!(path_prefix.ends_with('/'));
        self.path_prefix = Some(path_prefix);
        self
    }

    /// Set the authorized scopes for this client.  These will be passed along with request, and
    /// included in signed URLs, and will act as a limit on the scopes available for the operation
    /// beyond those afforded by the credentials themselves.
    pub fn authorized_scopes(
        mut self,
        authorized_scopes: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> Self {
        let authorized_scopes = collect_scopes(authorized_scopes);
        self.authorized_scopes = Some(authorized_scopes);
        self
    }

    /// Build the resulting client, consuming the builder
    pub fn build(self) -> Result<Client> {
        Client::new(self)
    }
}

impl From<String> for ClientBuilder {
    fn from(root_url: String) -> Self {
        Self::new(root_url)
    }
}

impl From<&str> for ClientBuilder {
    fn from(root_url: &str) -> Self {
        Self::new(root_url)
    }
}

/// Client is the entry point into all the functionality in this package. It
/// contains authentication credentials, and a service endpoint, which are
/// required for all HTTP operations.
pub struct Client {
    /// The credentials associated with this client and used for requests.
    /// If None, then unauthenticated requests are made.
    credentials: Option<hawk::Credentials>,

    /// The root URL used to configure this client
    root_url: String,

    /// The `ext` string for any requests made by this client, if any
    ext: Option<String>,

    /// Retry information.
    retry: Retry,

    /// The base URL for requests to the selected service / api version
    base_url: reqwest::Url,

    /// The host for the given root URL
    host: String,

    /// The port for the given root URL
    port: u16,

    /// Reqwest client
    client: reqwest::Client,
}

impl Client {
    /// Create a new client (public interface is via
    /// [`ClientBuilder::build`](crate::ClientBuilder::build))
    fn new(b: ClientBuilder) -> Result<Client> {
        // In general, try to pre-compute as much as possible here, so that later requests and
        // URL-generation operations are as fast as possible.  Once created, a Client is immutable.

        // build a base_url containing both the root URL and any path_prefix.  This allows
        // service-specific clients to provide only the portion of the path specific to
        // the API method being invoked.
        let mut base_url = reqwest::Url::parse(b.root_url.as_ref())
            .context(format!("while parsing {}", b.root_url))?;

        let host = base_url
            .host_str()
            .ok_or_else(|| anyhow!("The root URL {} doesn't contain a host", b.root_url))?
            .to_owned();

        let port = base_url
            .port_or_known_default()
            .ok_or_else(|| anyhow!("Unkown port for protocol {}", base_url.scheme()))?;

        if let Some(path_prefix) = b.path_prefix {
            base_url = base_url.join(path_prefix.as_ref()).context(format!(
                "while adding path_prefix to root_url {}",
                b.root_url
            ))?;
        }

        let retry = b.retry;
        let timeout = b.timeout;

        // build a reqwest client with the timeout configuration; this will also handle
        // connection re-use.
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(timeout)
            .build()?;

        // figure out the `certificate` and `authorizedScopes` parts of the ext property
        let mut certificate: Option<Value> = None;
        if let Some(Credentials {
            certificate: Some(ref cert_str),
            ..
        }) = b.credentials
        {
            certificate = Some(
                serde_json::from_str(cert_str)
                    .context("while parsing given certificate as JSON")?,
            );
        }

        let mut authorized_scopes: Option<Value> = None;
        if let Some(scopes) = b.authorized_scopes {
            authorized_scopes = Some(scopes.into());
        }

        let ext_json = match (certificate, authorized_scopes) {
            (Some(c), None) => Some(json!({ "certificate": c })),
            (None, Some(s)) => Some(json!({ "authorizedScopes": s })),
            (Some(c), Some(s)) => Some(json!({ "certificate": c, "authorizedScopes": s })),
            (None, None) => None,
        };

        let ext = if let Some(ext) = ext_json {
            let ext_str = serde_json::to_string(&ext)?;
            Some(base64::encode_config(ext_str, base64::URL_SAFE_NO_PAD))
        } else {
            None
        };

        // pre-generate the hawk::Credentials struct we will use to sign requests
        let credentials = match b.credentials {
            None => None,
            Some(c) => Some(hawk::Credentials {
                id: c.client_id.clone(),
                key: hawk::Key::new(&c.access_token, hawk::SHA256).context(c.client_id)?,
            }),
        };

        let root_url = b.root_url;

        Ok(Client {
            credentials,
            ext,
            retry,
            root_url,
            base_url,
            host,
            port,
            client,
        })
    }

    /// Make a request to a Taskcluster deployment.  While the per-service methods are generally
    /// more convenient, this method can be used to call a path on the deployment directly.
    ///
    /// The request URI is `<root_url>/<path_prefix>/<path>`.  The `path` parameter must not start
    /// with `/`.
    ///
    /// This will automatically retry on server-side errors and return an error for client errors.
    /// Success and redirection responses are treated as OK.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        query: Option<Vec<(&str, &str)>>,
        body: Option<&Value>,
    ) -> Result<reqwest::Response, Error> {
        let mut backoff = Backoff::new(&self.retry);

        let req = self.build_request(method, path, query, body)?;
        let url = req.url().as_str();

        let mut retries = self.retry.retries;
        loop {
            let req = req
                .try_clone()
                .ok_or_else(|| anyhow!("Cannot clone the request {}", url))?;

            let retry_for;
            match self.client.execute(req).await {
                // From the request docs for Client::execute:
                // > This method fails if there was an error while sending request, redirect loop
                // > was detected or redirect limit was exhausted.
                // All cases where there's a successful HTTP response are Ok(..).
                Err(e) => {
                    retry_for = e;
                }

                // Retry for server errors
                Ok(resp) if resp.status().is_server_error() => {
                    retry_for = resp.error_for_status().err().unwrap();
                }

                // client errors do not get retried
                Ok(resp) if resp.status().is_client_error() => {
                    let err = resp.error_for_status_ref().err().unwrap();

                    // try to add context based on the message from the JSON body, falling back
                    // to just returning the reqwest::Error
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(message) = json.get("message") {
                            if let Some(s) = message.as_str() {
                                return Err(Error::from(err).context(s.to_owned()));
                            }
                        }
                    }
                    return Err(err.into());
                }

                Ok(resp) => {
                    return Ok(resp);
                }
            };

            // if we got here, we are going to retry, or return the error if we are done
            // retrying.

            if retries == 0 {
                return Err(retry_for.into());
            }
            retries -= 1;

            match backoff.next_backoff() {
                Some(duration) => tokio::time::sleep(duration).await,
                None => return Err(retry_for.into()),
            }
        }
    }

    /// Get the root URL with which this client was configured
    pub fn root_url(&self) -> &str {
        self.root_url.as_ref()
    }

    fn build_request(
        &self,
        method: &str,
        path: &str,
        query: Option<Vec<(&str, &str)>>,
        body: Option<&Value>,
    ) -> Result<reqwest::Request, Error> {
        if path.starts_with('/') {
            bail!("Request path must not begin with `/`");
        }

        let mut url = self.base_url.join(path)?;

        if let Some(q) = query {
            url.query_pairs_mut().extend_pairs(q);
        }

        let meth = reqwest::Method::from_str(method)?;

        let mut req = self.client.request(meth, url);

        // pass content-length: 0 if there is no body.  This is implicit for GET requests,
        // but not for methods that typically have a body.  Most other HTTP clients do this
        // automatically!
        if body.is_none() {
            req = req.header("Content-Length", "0");
        }

        let req = match body {
            Some(b) => req.json(&b),
            None => req,
        };

        let req = req.build()?;

        match self.credentials {
            Some(ref creds) => self.sign_request(creds, req),
            None => Ok(req),
        }
    }

    fn sign_request(
        &self,
        creds: &hawk::Credentials,
        req: reqwest::Request,
    ) -> Result<reqwest::Request, Error> {
        let mut signed_req_builder = hawk::RequestBuilder::new(
            req.method().as_str(),
            &self.host,
            self.port,
            req.url().path(),
        );

        // hash the payload, if there is one
        let payload_hash;
        if let Some(ref b) = req.body() {
            let b = b
                .as_bytes()
                .ok_or_else(|| anyhow!("stream request bodies are not supported"))?;
            payload_hash = hawk::PayloadHasher::hash("application/json", hawk::SHA256, b)?;
            signed_req_builder = signed_req_builder.hash(&payload_hash[..])
        }

        signed_req_builder = signed_req_builder.ext(self.ext.as_ref().map(|s| s.as_ref()));

        let header = signed_req_builder.request().make_header(&creds)?;

        let token = HeaderValue::from_str(format!("Hawk {}", header).as_str()).context(header)?;

        let mut req = req;
        req.headers_mut().insert("Authorization", token);
        Ok(req)
    }

    /// Make a URL for the given path, constructed as for [`request`](crate::Client::request).  The
    /// path should not begin with a `/`.
    pub fn make_url(&self, path: &str, query: Option<Vec<(&str, &str)>>) -> Result<String> {
        if path.starts_with('/') {
            bail!("Request path must not begin with `/`");
        }

        let mut url = self.base_url.join(path)?;

        if let Some(q) = query {
            url.query_pairs_mut().extend_pairs(q);
        }
        Ok(url.as_ref().to_owned())
    }

    /// Make a signed URL for the given path, constructed as for
    /// [`request`](crate::Client::request).  The path should not begin with a `/`.  The URL will
    /// be valid for the given duration, and carries the client's scopes (including any
    /// authorized_scopes setting).
    pub fn make_signed_url(
        &self,
        path: &str,
        query: Option<Vec<(&str, &str)>>,
        ttl: Duration,
    ) -> Result<String> {
        if path.starts_with('/') {
            bail!("Request path must not begin with `/`");
        }

        let creds = if let Some(ref creds) = self.credentials {
            creds
        } else {
            return Err(anyhow!("Cannot sign a URL without credentials"));
        };

        let mut url = self.base_url.join(path)?;
        if let Some(q) = query {
            url.query_pairs_mut().extend_pairs(q);
        }

        // generate a full path containing the query
        let path_with_query = match url.query() {
            Some(q) => format!("{}?{}", url.path(), q),
            None => url.path().to_owned(),
        };

        let req = hawk::RequestBuilder::new("GET", &self.host, self.port, &path_with_query)
            .ext(self.ext.as_ref().map(|s| s.as_ref()))
            .request();

        let bewit = req.make_bewit_with_ttl(creds, ttl)?;

        url.query_pairs_mut().append_pair("bewit", &bewit.to_str());
        Ok(url.as_ref().to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::err_status_code;
    use anyhow::bail;
    use httptest::{matchers::*, responders::*, Expectation, Server};
    use serde_json::json;
    use std::fmt;
    use std::net::SocketAddr;
    use std::time::Duration;
    use tokio;

    /// An httptest matcher that will check Hawk authentication with the given cedentials.
    pub fn signed_with(creds: Credentials, addr: SocketAddr) -> SignedWith {
        SignedWith(creds, addr)
    }

    #[derive(Debug)]
    pub struct SignedWith(Credentials, SocketAddr);

    impl<B> Matcher<httptest::http::Request<B>> for SignedWith {
        fn matches(
            &mut self,
            input: &httptest::http::Request<B>,
            _ctx: &mut ExecutionContext,
        ) -> bool {
            let auth_header = input
                .headers()
                .get(httptest::http::header::AUTHORIZATION)
                .unwrap();
            let auth_header = auth_header.to_str().unwrap();
            if !auth_header.starts_with("Hawk ") {
                println!("Authorization header does not start with Hawk");
                return false;
            }
            let auth_header: hawk::Header = auth_header[5..].parse().unwrap();
            println!("header is {}", auth_header);

            // determine the host from the SocketAddr the same way that URL parsing
            // does -- this picks up "special" things like [..] around ipv6 literals
            let url = reqwest::Url::parse(format!("http://{}", self.1).as_ref()).unwrap();
            let host = url.host_str().unwrap();
            println!(
                "building hawk request for {} {} {} {}",
                input.method().as_str(),
                host,
                self.1.port(),
                input.uri().path()
            );
            let hawk_req = hawk::RequestBuilder::new(
                input.method().as_str(),
                host,
                self.1.port(),
                input.uri().path(),
            )
            .request();

            println!("access token is {}", self.0.access_token);
            let key = hawk::Key::new(&self.0.access_token, hawk::SHA256).unwrap();

            // this ts_skew duration needs to be large -- in CI, somehow 1s can elapse between
            // a request and the invocation of a matcher.
            if !hawk_req.validate_header(&auth_header, &key, Duration::from_secs(60)) {
                println!("Validation failed");
                return false;
            }

            true
        }

        fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
            <Self as fmt::Debug>::fmt(self, f)
        }
    }

    fn get_authorized_scopes(client: &Client) -> Result<Vec<String>> {
        let ext = if let Some(ref ext) = client.ext {
            ext
        } else {
            bail!("client has no ext")
        };

        let ext = base64::decode(ext)?;

        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Certificate {
            authorized_scopes: Vec<String>,
        }

        let ext = serde_json::from_slice::<Certificate>(&ext)?;
        Ok(ext.authorized_scopes)
    }

    #[test]
    fn test_authorized_scopes_vec() {
        let client = ClientBuilder::new("https://tc-tests.example.com")
            .authorized_scopes(vec!["a-scope"])
            .build()
            .unwrap();
        assert_eq!(get_authorized_scopes(&client).unwrap(), vec!["a-scope"]);
    }

    #[test]
    fn test_authorized_scopes_iter() {
        let nums = vec![1, 2, 3];
        let client = ClientBuilder::new("https://tc-tests.example.com")
            .authorized_scopes(nums.iter().map(|n| format!("scope:{}", n)))
            .build()
            .unwrap();
        assert_eq!(
            get_authorized_scopes(&client).unwrap(),
            vec!["scope:1", "scope:2", "scope:3"]
        );
    }

    #[tokio::test]
    async fn test_simple_request() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/api/queue/v1/ping"))
                .respond_with(status_code(200)),
        );
        let root_url = format!("http://{}", server.addr());

        let client = ClientBuilder::new(&root_url)
            .path_prefix("api/queue/v1/")
            .build()?;
        let resp = client.request("GET", "ping", None, None).await?;
        assert!(resp.status().is_success());
        Ok(())
    }

    #[tokio::test]
    async fn test_timeout() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/api/queue/v1/ping")).respond_with(
                // note that the tests do not wait for this to actually time out,
                // so this is a very long delay to avoid any test intermittency
                delay_and_then(Duration::from_secs(30), status_code(200)),
            ),
        );
        let root_url = format!("http://{}", server.addr());

        let client = ClientBuilder::new(&root_url)
            .path_prefix("api/queue/v1/")
            .timeout(Duration::from_millis(5))
            .retry(Retry {
                retries: 0,
                ..Default::default()
            })
            .build()?;
        let err = client.request("GET", "ping", None, None).await.unwrap_err();
        let reqerr = err.downcast::<reqwest::Error>().unwrap();
        assert!(reqerr.is_timeout());
        Ok(())
    }

    #[tokio::test]
    async fn test_simple_request_with_perm_creds() -> Result<(), Error> {
        let creds = Credentials::new("clientId", "accessToken");

        let server = Server::run();
        server.expect(
            Expectation::matching(all_of![
                request::method_path("GET", "/api/queue/v1/ping"),
                signed_with(creds.clone(), server.addr()),
            ])
            .respond_with(status_code(200)),
        );
        let root_url = format!("http://{}", server.addr());
        println!("root_url: {}", root_url);

        let client = ClientBuilder::new(&root_url)
            .path_prefix("api/queue/v1/")
            .credentials(creds)
            .build()?;
        let resp = client.request("GET", "ping", None, None).await?;
        assert!(resp.status().is_success());
        Ok(())
    }

    #[tokio::test]
    async fn test_query() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(all_of![
                request::method_path("GET", "/api/queue/v1/test"),
                request::query(url_decoded(contains(("taskcluster", "test")))),
                request::query(url_decoded(contains(("client", "rust")))),
            ])
            .respond_with(status_code(200)),
        );
        let root_url = format!("http://{}", server.addr());

        let client = ClientBuilder::new(&root_url)
            .path_prefix("api/queue/v1/")
            .build()?;
        let resp = client
            .request(
                "GET",
                "test",
                Some(vec![("taskcluster", "test"), ("client", "rust")]),
                None,
            )
            .await?;
        assert!(resp.status().is_success());
        Ok(())
    }

    #[tokio::test]
    async fn test_body() -> Result<(), Error> {
        let body = json!({"hello": "world"});

        let server = Server::run();
        server.expect(
            Expectation::matching(all_of![
                request::method_path("POST", "/api/queue/v1/test"),
                request::body(json_decoded(eq(body.clone()))),
            ])
            .respond_with(status_code(200)),
        );
        let root_url = format!("http://{}", server.addr());

        let client = ClientBuilder::new(&root_url)
            .path_prefix("api/queue/v1/")
            .build()?;
        let resp = client.request("POST", "test", None, Some(&body)).await?;
        assert!(resp.status().is_success());
        Ok(())
    }

    #[test]
    fn make_url_simple() -> Result<(), Error> {
        let client = ClientBuilder::new("https://tc-test.example.com")
            .path_prefix("api/queue/v1/")
            .build()?;
        let url = client.make_url("ping", None)?;
        assert_eq!(url, "https://tc-test.example.com/api/queue/v1/ping");
        Ok(())
    }

    #[test]
    fn make_url_escapable_characters() -> Result<(), Error> {
        let client = ClientBuilder::new("https://tc-test.example.com")
            .path_prefix("api/queue/v1/")
            .build()?;
        let url = client.make_url("escape%2Fthis!", None)?;
        assert_eq!(
            url,
            "https://tc-test.example.com/api/queue/v1/escape%2Fthis!"
        );
        Ok(())
    }

    #[test]
    fn make_url_query() -> Result<(), Error> {
        let client = ClientBuilder::new("https://tc-test.example.com")
            .path_prefix("api/queue/v1/")
            .build()?;
        let url = client.make_url("a/b/c", Some(vec![("abc", "def"), ("x!z", "1/3")]))?;
        assert_eq!(
            url,
            "https://tc-test.example.com/api/queue/v1/a/b/c?abc=def&x%21z=1%2F3"
        );
        Ok(())
    }

    #[test]
    fn make_signed_url_simple() -> Result<(), Error> {
        let creds = Credentials::new("clientId", "accessToken");
        let client = ClientBuilder::new("https://tc-test.example.com")
            .path_prefix("api/queue/v1/")
            .credentials(creds)
            .build()?;
        let url = client.make_signed_url("a/b", None, Duration::from_secs(10))?;
        assert!(url.starts_with("https://tc-test.example.com/api/queue/v1/a/b?bewit="));
        Ok(())
    }

    #[test]
    fn make_signed_url_query() -> Result<(), Error> {
        let creds = Credentials::new("clientId", "accessToken");
        let client = ClientBuilder::new("https://tc-test.example.com")
            .path_prefix("api/queue/v1/")
            .credentials(creds)
            .build()?;
        let url = client.make_signed_url(
            "a/b/c",
            Some(vec![("abc", "def"), ("xyz", "1/3")]),
            Duration::from_secs(10),
        )?;
        assert!(url.starts_with(
            "https://tc-test.example.com/api/queue/v1/a/b/c?abc=def&xyz=1%2F3&bewit="
        ));
        Ok(())
    }

    fn retry_fast() -> Retry {
        Retry {
            retries: 6,
            max_delay: Duration::from_millis(1),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn test_500_retry() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/api/queue/v1/test"))
                .times(7) // 1 try, 6 retries
                .respond_with(status_code(500)),
        );
        let root_url = format!("http://{}", server.addr());
        let client = ClientBuilder::new(root_url)
            .path_prefix("api/queue/v1/")
            .retry(retry_fast())
            .build()?;

        let result = client.request("GET", "test", None, None).await;
        assert!(result.is_err());
        let reqw_err: reqwest::Error = result.err().unwrap().downcast()?;
        assert_eq!(reqw_err.status().unwrap(), 500);
        Ok(())
    }

    #[tokio::test]
    async fn test_400_no_retry() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/api/queue/v1/test"))
                .times(1)
                .respond_with(status_code(400)),
        );
        let root_url = format!("http://{}", server.addr());
        let client = ClientBuilder::new(root_url)
            .path_prefix("api/queue/v1/")
            .retry(retry_fast())
            .build()?;

        let result = client.request("GET", "test", None, None).await;
        assert!(result.is_err());
        assert_eq!(
            err_status_code(&result.err().unwrap()),
            Some(reqwest::StatusCode::BAD_REQUEST)
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_303_no_follow() -> Result<(), Error> {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/api/queue/v1/test"))
                .times(1)
                // should not follow this redirect..
                .respond_with(
                    status_code(303)
                        .insert_header("location", "http://httpstat.us/404")
                        .insert_header("content-type", "application/json")
                        .body("{\"url\":\"http://httpstat.us/404\"}"),
                ),
        );
        let root_url = format!("http://{}", server.addr());
        let client = ClientBuilder::new(root_url)
            .path_prefix("api/queue/v1/")
            .retry(retry_fast())
            .build()?;

        let resp = client.request("GET", "test", None, None).await?;
        assert_eq!(resp.status(), 303);
        assert_eq!(
            resp.json::<serde_json::Value>().await?,
            json!({"url": "http://httpstat.us/404"})
        );
        Ok(())
    }
}
