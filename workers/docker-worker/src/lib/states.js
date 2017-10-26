var assert = require('assert');
var debug = require('debug')('docker-worker:states');
var _ = require('lodash');

function hasMethod(method, input) {
  return typeof input[method] === 'function';
}

/**
The state handler is a FSM-ish handler for the various points in a single task's
lifetime. The hooks provided by this module are used to extend the basic
behaviour of task handling (and hand in hand with feature flags allow granular
selection of actions which have various performance impacts on the task being
run).

Each "state" in the lifetime is a well defined function:

  - link    : prior to creating the task container returning containers to be
              linked in.

  - created : After the container has been created but prior to running the
              container. Useful for loggers, etc... No value is returned.

  - stopped : After the container has completely run (not run in cases where the
              container has not run).

  - killed:   After the task container has been entirely removed. The intention
              is for this to be used to cleanup any remaining linked containers.

@constructor
@param {Array[Object]} hooks for handling states in the task lifecycle.
*/
class States {
  constructor(hooks) {
    assert.ok(Array.isArray(hooks), 'hooks is an array');
    this.hooks = hooks;
  }

  /**
  Invoke all hooks with a particular method.
  @param {Task} task handler.
  */
  _invoke(method, task) {
    debug('taskId: %s at state: %s', task.status.taskId, method);
    let hooks = this.hooks.filter(hasMethod.bind(this, method));

    let errors = [];
    return Promise.all(
        hooks.map(hook => {
          return hook[method](task)
            .then(info => { return info; })
            .catch(err => {
              errors.push(new Error(`Error calling '${method}' for ${hook.featureName} : ${err.message}`));
            });
        })
    ).then(results => {
      if (errors.length > 0) {
        throw new Error(errors.map(e => e.message).join(' | '));
      }
      return results;
    });
  }

  /**
  The "link" state is responsible for creating any dependent containers and
  returning the name of the container to be "linked" with the task container,
  additionally it may also return over-writeable environment variables to
  give to the task.

  Each "hook" which contains a link method or wants to declare an env variable
  _must_ return an object in the following format:

  ```js
    {
      links: [
        {name: 'container name', alias: 'alias in task container'}
      ]
      env: {
        'name-of-env-var':  'value of variable'
      },
      binds: [
        {source: '/path/on/host', target: '/path/in/container', readOnly: true}
      ]
    }
  ```

  All links are run in parallel then merged.
  Note, that environment variables can be overwritten by task-specific
  environment variables, or environment variables from other hooks.

  @param {Task} task handler.
  @return {Object} object on the same form as returned by hook, see above.
  */
  async link(task) {
    // Build the list of linked containers...
    let results = await this._invoke('link', task);

    // List of lists of links
    let listsOfLinks = results.map(_.property('links')).filter(_.isArray);

    // List of env objects
    let listsOfEnvs = results.map(_.property('env')).filter(_.isObject);

    // List of lists of binds
    let listsOfBinds = results.map(_.property('binds')).filter(_.isArray);

    // Merge env objects and flatten lists of links
    return {
      links:  _.flatten(listsOfLinks),
      env:    _.defaults.apply(_, listsOfEnvs),
      binds:  _.flatten(listsOfBinds)
    };
  }

  /**
  Invoke the `create hook no value is expected to be returned this is
  effectively for "side effects" like logging which must start prior to running
  the container.

  @param {Task} task handler.
  @return void.
  */
  created(task) {
    return this._invoke('created', task);
  }

  /**
  Invoke the `started hook no value is expected to be returned this is
  effectively for "side effects" monitoring the container or executing
  scripts inside it while it's running.

  @param {Task} task handler.
  @return void.
  */
  started(task) {
    return this._invoke('started', task);
  }

  /**
  Invoke the `stop` hook intended to be used to upload any artifacts created
  during the task container run (which is in a stopped state at this point).

  @param {Task} task handler.
  @return void.
  */
  stopped(task) {
    return this._invoke('stopped', task);
  }

  /**
  The `kill hook is intended to be used to cleanup any remaining containers and
  finalize any log artifacts.

  @param {Task} task handler
  @return void.
  */
  killed(task) {
    return this._invoke('killed', task);
  }
}

module.exports = States;
