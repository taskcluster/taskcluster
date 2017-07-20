---
title: Using Taskcluster for Github Projects
order: 10
---

Taskcluster is easy to set up for simple CI cases and very expressive
and powerful for more complex cases. It should fit just about any
use case you can think of for CI on a Github project. It is used for
projects as simple to test as calling `npm test` all the way up to
the very complex set of tasks to perform in order to test and build
the Firefox browser.

The syntax offers an enormous amount of flexibility. [The quickstart tool](https://tools.taskcluster.net/quickstart/) should get you going quickly.

The eventual goal of this project is to support all platforms and allow users to define workflows for testing, shipping, and landing patches from within their configurations. Currently, we offer mostly Linux support and have Windows available.
