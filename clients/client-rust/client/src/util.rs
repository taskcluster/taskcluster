use percent_encoding::{utf8_percent_encode, AsciiSet, PercentEncode, NON_ALPHANUMERIC};
use reqwest::StatusCode;
use std::iter::{FromIterator, IntoIterator, Iterator};

// based on https://docs.python.org/3/library/urllib.parse.html#urllib.parse.quote
// which defines what the Python client does here
const NOT_ENCODED: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'_')
    .remove(b'.')
    .remove(b'-')
    .remove(b'~');

pub(crate) fn urlencode(input: &str) -> PercentEncode<'_> {
    utf8_percent_encode(input, NOT_ENCODED)
}

/// If this error was due to a reqwest error created from an HTTP response, return the status code
/// from that response.  If the error is not a `reqwest::Error`, or was not caused by an HTTP
/// response, returns None.
pub fn err_status_code(err: &anyhow::Error) -> Option<StatusCode> {
    if let Some(err) = err.downcast_ref::<reqwest::Error>() {
        err.status()
    } else {
        None
    }
}

pub(crate) fn collect_scopes<R: FromIterator<String>>(
    scopes: impl IntoIterator<Item = impl AsRef<str>>,
) -> R {
    scopes.into_iter().map(|s| s.as_ref().to_string()).collect()
}

#[cfg(test)]
mod test {
    use super::*;
    use httptest::{matchers::*, responders::*, Expectation, Server};
    use tokio;

    macro_rules! urlencode_tests {
        ($($name:ident: $input:expr, $output:expr,)*) => {
        $(
            #[test]
            fn $name() {
                assert_eq!(&urlencode($input).to_string(), $output);
            }
        )*
        }
    }

    urlencode_tests! {
        unencoded: "abc-ABC_123.tilde~..", "abc-ABC_123.tilde~..",
        slashes: "abc/def", "abc%2Fdef",
        spaces: "abc def", "abc%20def",
        control: "abc\ndef", "abc%0Adef",
    }

    #[tokio::test]
    async fn test_err_status_code() {
        let server = Server::run();
        server.expect(
            Expectation::matching(request::method_path("GET", "/")).respond_with(status_code(418)),
        );
        // this is a long chain just to get a reqwest::Error with status code 418!
        let err = reqwest::Client::new()
            .get(&format!("http://{}/", server.addr()))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .err()
            .unwrap();
        let err: anyhow::Error = err.into();
        assert_eq!(err_status_code(&err), Some(StatusCode::IM_A_TEAPOT));
    }
}
