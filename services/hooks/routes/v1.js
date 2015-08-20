var Promise = require('promise')l
var debug   = require('debug')('routes:v1');
var base    = require('taskcluster-base');

var api = new base.API({
  title: "Hooks API Documentation",
  description: "Todo",
  schemaPrefic: 'http://schemas.taskcluster.net/queue/v1/',
});

// Export api
module.exports = api;

/** Get hook groups **/
api.declare({
  method:     'get',
  route:      '/hooks',
  name:       'listHookGroups',
  idempotent: true,
  scopes:     [[]],
  output:     'list-hook-groups-response.json',
  title:      'List hook groups',
  description: ''
}, async function(req, res) {

});


/** Get hooks in a given group **/
api.declare({
  method:     'get',
  route:      '/hooks/:hookGroup',
  name:       'listHooks',
  idempotent: true,
  scopes:     [[]],
  output:     'list-hooks-response.json',
  title:      'List hooks in a given group',
  description: ''
}, async function(req, res) {

});


/** Get hook definition **/
api.declare({
  method:     'get',
  route:      '/hooks/:hookGroup/:hookId',
  name:       'hook',
  idempotent: true,
  scopes:     [[]],
  output:     'hook-defintion.json',
  title:      'Get hook definition',
  description: ''
}, async function(req, res) {

});


/** Create a hook **/
api.declare({
  method:     'put',
  route:      '/hooks/:hookGroup/:hookId',
  name:       'createHook',
  idempotent: true,
  scopes:     [["hooks:modify-hook:<hookGroup>/<hookId>]],
  input:      'create-hook-request.json',
  output:     'hook-defintion.json',
  title:      'Create a hook',
  description: ''
}, async function(req, res) {

});


/** Update hook definition**/
api.declare({
  method:     'patch',
  route:      '/hooks/:hookGroup/:hookId',
  name:       'updateHook',
  idempotent: true,
  scopes:     [["hooks:modify-hook:<hookGroup>/<hookId>]],
  input:      'create-hook-request.json',
  output:     'hook-definition.json',
  title:      'Update a hook',
  description: ''
}, async function(req, res) {

});


/** Get secret token for a trigger **/
api.declare({
  method:     'get',
  route:      '/hooks/:hookGroup/:hookId/token',
  name:       'getTriggerToken',
  idempotent: true,
  scopes:     [["hooks:get-trigger-token:<hookGroup>/<hookId>]],
  title:      'Get a trigger token',
  description: ''
}, async function(req, res) {

});


/** Reset a trigger token **/
api.declare({
  method:     'post',
  route:      '/hooks/:hookGroup/:hookId/token',
  name:       'resetTriggerToken',
  idempotent: true,
  scopes:     [["hooks:reset-trigger-token:<hookGroup>/<hookId>]],
  title:      'Reset a trigger token',
  description: ''
}, async function(req, res) {

});


/** Trigger hook from a webhook with a token **/
api.declare({
  method:     'post',
  route:      '/hooks/:hookGroup/:hookId/trigger/:token',
  name:       'triggerHookWithToken',
  idempotent: true,
  scopes:     [[]],
  input:      'trigger-payload.json',
  output:     'trigger-response.json',
  title:      'Trigger a hook with a token',
  description: ''
}, async function(req, res) {

});


/** Trigger a hook for debugging **/
api.declare({
  method:     'post',
  route:      '/hooks/:hookGroup/:hookId/trigger',
  name:       'triggerHook',
  idempotent: true,
  scopes:     [["hooks:trigger-hook:<hookGroup>/<hookId>"]],
  deferAuth:  true,
  input:      'trigger-playload.json',
  output:     'trigger-response.json',
  title:      'Trigger a hook',
  description: ''
}, async function(req, res) {

});
