/*! Support for downloading data from the object service.

This crate provides a set of functions to download data from the object service.
These functions negotiate a download method with the object service, then perform the download, following all of the Taskcluster recommended practices.

Each function takes the necessary metadata for the download, a handle to the a destination for the data, and a [taskcluster::Object] client.
The destination can take a variety of forms, as described below.
The client must be configured with the necessary credentials to access the object service.

## Convenience Functions

Most uses of this crate can utilize one of the following convenience functions:

* [download_to_buf] -- download data to a fixed-size buffer;
* [download_to_vec] -- download data to a dynamically allocated buffer; or
* [download_to_file] -- download data to a [tokio::fs::File].

## Artifacts

This crate also supports downloads of artifacts, including all defined storage types.
This combines a query to the queue service to request the artifact metadata with the appropriate process to download that data.
In the case of error artifacts, a [`Result::Err`] is returned.

* [download_artifact_to_buf] -- download artifact data to a fixed-size buffer;
* [download_artifact_to_vec] -- download artifact data to a dynamically allocated buffer; or
* [download_artifact_to_file] -- download artifact data to a [tokio::fs::File].

## Factories

A download may be retried, in which case the download function must have a means to truncate the data destination and begin writing from the beginning.
This is accomplished with the [`AsyncWriterFactory`](crate::AsyncWriterFactory) trait, which defines a `get_writer` method to generate a fresh [tokio::io::AsyncWrite] for each attempt.
Users for whom the supplied convenience functions are inadequate can add their own implementation of this trait.

 */
mod artifact;
mod factory;
mod geturl;
mod object;
mod service;

#[cfg(test)]
mod test_helpers;

pub use artifact::{
    download_artifact_to_buf, download_artifact_to_file, download_artifact_to_vec,
    download_artifact_with_factory,
};
pub use factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
pub use object::{download_to_buf, download_to_file, download_to_vec, download_with_factory};
