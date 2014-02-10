require('pkginfo')(module)
version = @version

_ = require('underscore')

ironCore = require('iron_core');

class APIClient extends ironCore.Client
  AWS_US_EAST_HOST: 'mq-aws-us-east-1.iron.io'
  RACKSPACE_HOST: 'mq-rackspace-dfw.iron.io'

  constructor: (options) ->
    defaultOptions =
      scheme: 'https',
      host: @AWS_US_EAST_HOST,
      port: 443,
      api_version: 1,
      user_agent: version,
      queue_name: 'default'

    super('iron', 'mq', options, defaultOptions, ['project_id', 'token', 'api_version', 'queue_name'])

  version: ->
    "iron_mq_node-#{version} (#{super()})"

  url: ->
    super() + @options.api_version.toString() + "/projects/#{@options.project_id}/queues"

  headers: ->
    _.extend({}, super(), {'Authorization': "OAuth #{@options.token}"})

  queuesList: (options, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)
        
    @get("", options, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesGet: (queue_name, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)
        
    @get("/#{queue_name}", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesClear: (queue_name, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)
        
    @post("/#{queue_name}/clear", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesUpdate: (queue_name, options, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @post("/#{queue_name}", options, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesAddSubscribers: (queue_name, subscribers, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @post("/#{queue_name}/subscribers", subscribers, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesRemoveSubscribers: (queue_name, subscribers, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @delete("/#{queue_name}/subscribers", subscribers, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  queuesDelete: (queue_name, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @delete("/#{queue_name}", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesPost: (queue_name, messages, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)
        
    @post("/#{queue_name}/messages", {messages: messages}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesGet: (queue_name, options, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)
        
    @get("/#{queue_name}/messages", options, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesDelete: (queue_name, message_id, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @delete("/#{queue_name}/messages/#{message_id}", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesPeek: (queue_name, options, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @get("/#{queue_name}/messages/peek", options, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesTouch: (queue_name, message_id, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @post("/#{queue_name}/messages/#{message_id}/touch", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesRelease: (queue_name, message_id, options, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @post("/#{queue_name}/messages/#{message_id}/release", options, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesPushStatuses: (queue_name, message_id, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @get("/#{queue_name}/messages/#{message_id}/subscribers", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

  messagesPushStatusDelete: (queue_name, message_id, subscriber_id, cb) ->
    parseResponseBind = _.bind(@parseResponse, @)

    @delete("/#{queue_name}/messages/#{message_id}/subscribers/#{subscriber_id}", {}, (error, response, body) ->
      parseResponseBind(error, response, body, cb)
    )

module.exports.APIClient = APIClient
