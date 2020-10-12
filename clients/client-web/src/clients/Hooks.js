// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import Client from '../Client';

export default class Hooks extends Client {
  constructor(options = {}) {
    super({
      serviceName: 'hooks',
      serviceVersion: 'v1',
      exchangePrefix: '',
      ...options,
    });
    this.ping.entry = {"args":[],"category":"Ping Server","method":"get","name":"ping","query":[],"route":"/ping","stability":"stable","type":"function"}; // eslint-disable-line
    this.listHookGroups.entry = {"args":[],"category":"Hooks","method":"get","name":"listHookGroups","output":true,"query":[],"route":"/hooks","scopes":"hooks:list-hook-groups","stability":"stable","type":"function"}; // eslint-disable-line
    this.listHooks.entry = {"args":["hookGroupId"],"category":"Hooks","method":"get","name":"listHooks","output":true,"query":[],"route":"/hooks/<hookGroupId>","scopes":"hooks:list-hooks:<hookGroupId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.hook.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","method":"get","name":"hook","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>","scopes":"hooks:get:<hookGroupId>:<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.getHookStatus.entry = {"args":["hookGroupId","hookId"],"category":"Hook Status","method":"get","name":"getHookStatus","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/status","scopes":"hooks:status:<hookGroupId>/<hookId>","stability":"deprecated","type":"function"}; // eslint-disable-line
    this.createHook.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","input":true,"method":"put","name":"createHook","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>","scopes":{"AllOf":["hooks:modify-hook:<hookGroupId>/<hookId>","assume:hook-id:<hookGroupId>/<hookId>"]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.updateHook.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","input":true,"method":"post","name":"updateHook","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>","scopes":{"AllOf":["hooks:modify-hook:<hookGroupId>/<hookId>","assume:hook-id:<hookGroupId>/<hookId>"]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.removeHook.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","method":"delete","name":"removeHook","query":[],"route":"/hooks/<hookGroupId>/<hookId>","scopes":"hooks:modify-hook:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.triggerHook.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","input":true,"method":"post","name":"triggerHook","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/trigger","scopes":"hooks:trigger-hook:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.getTriggerToken.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","method":"get","name":"getTriggerToken","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/token","scopes":"hooks:get-trigger-token:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.resetTriggerToken.entry = {"args":["hookGroupId","hookId"],"category":"Hooks","method":"post","name":"resetTriggerToken","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/token","scopes":"hooks:reset-trigger-token:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.triggerHookWithToken.entry = {"args":["hookGroupId","hookId","token"],"category":"Hooks","input":true,"method":"post","name":"triggerHookWithToken","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/trigger/<token>","scopes":"hooks:trigger-hook:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.listLastFires.entry = {"args":["hookGroupId","hookId"],"category":"Hook Status","method":"get","name":"listLastFires","output":true,"query":[],"route":"/hooks/<hookGroupId>/<hookId>/last-fires","scopes":"hooks:list-last-fires:<hookGroupId>/<hookId>","stability":"stable","type":"function"}; // eslint-disable-line
  }
  /* eslint-disable max-len */
  // Respond without doing anything.
  // This endpoint is used to check that the service is up.
  /* eslint-enable max-len */
  ping(...args) {
    this.validate(this.ping.entry, args);

    return this.request(this.ping.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will return a list of all hook groups with at least one hook.
  /* eslint-enable max-len */
  listHookGroups(...args) {
    this.validate(this.listHookGroups.entry, args);

    return this.request(this.listHookGroups.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will return a list of all the hook definitions within a
  // given hook group.
  /* eslint-enable max-len */
  listHooks(...args) {
    this.validate(this.listHooks.entry, args);

    return this.request(this.listHooks.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will return the hook definition for the given `hookGroupId`
  // and hookId.
  /* eslint-enable max-len */
  hook(...args) {
    this.validate(this.hook.entry, args);

    return this.request(this.hook.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will return the current status of the hook.  This represents a
  // snapshot in time and may vary from one call to the next.
  // This method is deprecated in favor of listLastFires.
  /* eslint-enable max-len */
  getHookStatus(...args) {
    this.validate(this.getHookStatus.entry, args);

    return this.request(this.getHookStatus.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will create a new hook.
  // The caller's credentials must include the role that will be used to
  // create the task.  That role must satisfy task.scopes as well as the
  // necessary scopes to add the task to the queue.
  /* eslint-enable max-len */
  createHook(...args) {
    this.validate(this.createHook.entry, args);

    return this.request(this.createHook.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will update an existing hook.  All fields except
  // `hookGroupId` and `hookId` can be modified.
  /* eslint-enable max-len */
  updateHook(...args) {
    this.validate(this.updateHook.entry, args);

    return this.request(this.updateHook.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will remove a hook definition.
  /* eslint-enable max-len */
  removeHook(...args) {
    this.validate(this.removeHook.entry, args);

    return this.request(this.removeHook.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will trigger the creation of a task from a hook definition.
  // The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
  // provided as the `payload` property of the JSON-e context used to render the
  // task template.
  /* eslint-enable max-len */
  triggerHook(...args) {
    this.validate(this.triggerHook.entry, args);

    return this.request(this.triggerHook.entry, args);
  }
  /* eslint-disable max-len */
  // Retrieve a unique secret token for triggering the specified hook. This
  // token can be deactivated with `resetTriggerToken`.
  /* eslint-enable max-len */
  getTriggerToken(...args) {
    this.validate(this.getTriggerToken.entry, args);

    return this.request(this.getTriggerToken.entry, args);
  }
  /* eslint-disable max-len */
  // Reset the token for triggering a given hook. This invalidates token that
  // may have been issued via getTriggerToken with a new token.
  /* eslint-enable max-len */
  resetTriggerToken(...args) {
    this.validate(this.resetTriggerToken.entry, args);

    return this.request(this.resetTriggerToken.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint triggers a defined hook with a valid token.
  // The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
  // provided as the `payload` property of the JSON-e context used to render the
  // task template.
  /* eslint-enable max-len */
  triggerHookWithToken(...args) {
    this.validate(this.triggerHookWithToken.entry, args);

    return this.request(this.triggerHookWithToken.entry, args);
  }
  /* eslint-disable max-len */
  // This endpoint will return information about the the last few times this hook has been
  // fired, including whether the hook was fired successfully or not
  /* eslint-enable max-len */
  listLastFires(...args) {
    this.validate(this.listLastFires.entry, args);

    return this.request(this.listLastFires.entry, args);
  }
}
