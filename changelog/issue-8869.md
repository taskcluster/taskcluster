audience: users
level: major
reference: issue 8869
---

The client-rust `AsyncWriterFactory` now needs to be `Send` and the `get_writer` method now takes an optional `content_length` parameter that indicates what size the writer should expect. The `get_writer` method is also now only called when the initial request succeeded and the response stream is about to be pulled.
