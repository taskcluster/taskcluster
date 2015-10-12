import base from 'taskcluster-base';
import _ from 'lodash';

var data = {} = module.exports;

data.SecretEntity = base.Entity.configure({
    version:          1,
    signEntities:     true,
    partitionKey:     base.Entity.keys.ConstantKey('secrets'),
    rowKey:           base.Entity.keys.StringKey('name'),
    properties: {
      name:           base.Entity.types.String,
      secret:         base.Entity.types.EncryptedJSON,
      expires:        base.Entity.types.Date
    }
});

/** Return JSON representation of the secret */
data.SecretEntity.prototype.json = function() {
  return {
    secret: _.cloneDeep(this.secret),
    expires: this.expires.toJSON()
  };
};
