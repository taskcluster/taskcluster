import base from 'taskcluster-base';

let exchanges = new base.Exchanges({
  title: "Taskcluster-treeherder Pulse Exchange",
  description: [
    "The taskcluster-treeherder service is responsible for processing",
    "task events published by TaskCluster Queue and producing job messages",
    "that are consumable by Treeherder.",
    "",
    "This exchange provides that job messages to be consumed by any queue that",
    "attached to the exchange.  This could be a production Treeheder instance,",
    "a local development environment, or a custom dashboard."
  ].join('\n'),

  schemaPrefix: 'http://schemas.taskcluster.net/taskcluster-treeherder/v1/'
});

module.exports = exchanges;

/** Build common routing key construct for `exchanges.declare` */
let buildRoutingKey = (options={}) => {
  return [
    {
      name:             'destination',
      summary:          'destination',
      required:         true,
      maxSize:          25
    },
    {
      name:             'project',
      summary:          'project',
      required:         true,
      maxSize:          25
    },
    {
      name:             'reserved',
      summary:          "Space reserved for future routing-key entries, you " +
                        "should always match this entry with `#`. As " +
                        "automatically done by our tooling, if not specified.",
      multipleWords:    true,
      maxSize:          1
    }
  ];
};

/** Build an AMQP compatible message from a message */
let commonMessageBuilder = (message) => {
  message.version = 1;
  return message;
};

let commonRoutingKeyBuilder = (message, routing) => {
  return routing;
}

/** Jobs exchange */
exchanges.declare({
  exchange:           'jobs',
  name:               'jobs',
  title:              "Job Messages",
  description: [
    "When a task run is scheduled or resolved, a message is posted to",
    "this exchange in a Treeherder consumable format."
  ].join('\n'),
  routingKey:         buildRoutingKey(),
  schema:             'pulse-job.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder,
  CCBuilder:          () => []
});
