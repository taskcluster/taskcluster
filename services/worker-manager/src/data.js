const yaml = require('js-yaml');
const Entity = require('azure-entities');

const WorkerType = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('name'),
  rowKey: Entity.keys.ConstantKey('workerType'),
  properties: {
    name: Entity.types.String,
    provider: Entity.types.String,
    description: Entity.types.String,
    created: Entity.types.Date,
    lastModified: Entity.types.Date,
    config: Entity.types.JSON,
    errors: Entity.types.JSON,
    owner: Entity.types.String,
    providerData: Entity.types.JSON, // providers can use this to remember values between provisioning runs
  },
});

WorkerType.prototype.serializable = function() {
  return {
    name: this.name,
    provider: this.provider,
    description: this.description,
    created: this.created.toJSON(),
    lastModified: this.lastModified.toJSON(),
    config: this.config,
    errors: this.errors,
    owner: this.owner,
  };
};

WorkerType.prototype.reportError = async function({kind, title, description, extra, notify, owner}) {
  await this.modify(wt => {
    wt.errors.unshift({
      reported: new Date(),
      kind,
      title,
      description,
      extra,
    });
    wt.errors = wt.errors.slice(0, 100);
  });
  await notify.email({
    address: owner,
    subject: `Taskcluster Worker Manager Error: ${title}`,
    content: `
Worker Manager has encountered an error while trying to provision the workertype ${this.name}:

\`\`\`
${description}
\`\`\`

It includes the extra information:

\`\`\`json
${yaml.safeDump(extra)}
\`\`\`
    `.trim(),
  });
};

module.exports = {
  WorkerType,
};
