# TaskCluster Queue [![Build Status](https://travis-ci.org/taskcluster/taskcluster-queue.png?branch=master)](https://travis-ci.org/taskcluster/taskcluster-queue)

This the central queue coordinating execution of tasks in the TaskCluster setup.

**Warning:** This is still very much a prototype.

Project Structure
-----------------
_The following itemization of folders outlines how this project is structured._

 * `queue/`, contains queue application logic.
 * `routes/`, contains all forms of HTTP entries, including the API, though the
   API is mainly implemented by the application logic in `queue/`
   (or at least this is the intention, as we improve the implementation).
 * `views/`, templates for HTTP entries...
 * `static/`, static files for templates.
 * `schemas/`, JSON Schemas against which all input and output, i.e. messages,
    S3 files, requests and responses should be validated against.
 * `tests/`, automated tests using `nodeunit`, launched with `node tests` so
   that we can stick in other test frameworks should we ever need it.
 * `utils/`, various helpful utilities, monkey-patches, etc. that are useful,
   but not exactly query specific.


Deployment
----------
Code is deployed from master to heroku whenever code hits master (and it passes travis ci)

Things To Do
------------

 * Add schemas for all inputs and outputs, including `logs.json` and
   `result.json` as uploaded by workers when tasks are completed.
 * Add tests both positive and negative for all schemas.
 * Add `title` and helpful `description` properties to all values validated by
   schemas, not just top-level (think JSON schemas supports these meta tags
   on all levels).
 * Ensure proper process isolation between all test modules.
   (or figure out how to reload the `pg.js` module).
 * Refactor folder layout for tests as needed, and consider a utilites for
   setup/teardown of server before/after all tests.
   (or figure out how to reload the `pg.js` module).
 * Implement the `queue/data.js` module in smarter way... Ensure consistency,
   use transactions correctly (consider serializable transactions).
 * Remove any and all logic from modules in `routes/api/`, they should just wrap
   logic implemented in the `queue/` folder, so that updating the API version
   and adding new properties is trivial. Essentially, `routes/api/` should only
   ensure that values returned by the API matches the schema requirements for
   the specific version of the API implemented.
 * Handles errors in `routes/api/` in a better way, probably need to formalize
   how errors are reported, also improve how schema errors are reported.
 * Look at how provisioners
 * Put a useful UI on the queue, or completely remove the entire UI, and just
   offer an API for making a UI. Consider that:
    * UI helps us debugging tasks,
    * We need to registration for non-uuid strings
    * Somewhere central needs to provide oauth tokens which can be baked into
      machine images
    * Serverside UI might be a little simpler than coding it all in JS.
    * Pure clientside UI with CORS allows others to make dev-tools, but nobody
      is going to do this.
    * Docs needs to be presented somewhere, this can be generated from
      `title` and `desc` properties on API entries declarations. As well as
      JSON schemas, which can be decorated with `title` and `description`.
