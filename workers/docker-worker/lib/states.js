var assert = require('assert');
var debug = require('debug')('taskcluster-docker-worker:states');
var co = require('co');

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
export default class States {
  constructor(hooks) {
    assert.ok(Array.isArray(hooks), 'hooks is an array');
    this.hooks = hooks;
  }

  /**
  Invoke all hooks with a particular method.
  @param {Task} task handler.
  */
  async _invoke(method, task) {
    let hooks = this.hooks.filter(hasMethod.bind(this, method));
    return  await Promise.all(hooks.map(async (hook) => {
      return await hook[method](task);
    }));
  }

  /**
  The "link" state is responsible for creating any dependant containers and
  returning the name of the container to be "linked" with the task container.

  Each "hook" which contains a link method _must_ return an array in the
  following format:

  ```js
      [
        { name: 'container name', alias: 'alias in task container' }
      ]
  ```

  All links are run in parallel then merged.

  @param {Task} task handler.
  @return {Array[Object]} list of link aliases.
  */
  async link(task) {
    // Build the list of linked containers...
    var links = await this._invoke('link', task);

    // Flat map.
    return links.reduce(function(result, current) {
      return result.concat(current);
    }, [])
  }

  /**
  Invoke the `create hook no value is expected to be returned this is
  effectively for "side effects" like logging which must start prior to running
  the container.

  @param {Task} task handler.
  @return void.
  */
  async created(task) {
    await this._invoke('created', task);
  }

  /**
  Invoke the `stop` hook intended to be used to upload any artifacts created
  during the task container run (which is in a stopped state at this point).

  @param {Task} task handler.
  @return void.
  */
  async stopped(task) {
    await this._invoke('stopped', task);
  }

  /**
  The `kill hook is intended to be used to cleanup any remaining containers and
  finalize any log artifacts.

  @param {Task} task handler
  @return void.
  */
  async killed(task) {
    await this._invoke('killed', task);
  }
}
