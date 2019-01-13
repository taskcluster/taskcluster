const {Schema, READ, WRITE} = require('taskcluster-lib-postgres');

const schema = new Schema({
  serviceName: 'secrets',
  script: `
    begin
      create table secrets (
        name text primary key,
        secret text
      );
    end`})
  .addVersion(2, `
    begin
      alter table secrets add column expires timestamp;
    end`)
  .addMethod('getSecret', READ, 'name text', 'table (secret text, expires timestamp)', `
    begin
      return query select secrets.secret, secrets.expires from secrets where secrets.name = getSecret.name;
    end`)
  .addMethod('listSecrets', READ, '', 'table (name text, expires timestamp)', `
    begin
      return query select secrets.name as name, secrets.expires as expires from secrets;
    end`)
  .addMethod('removeSecret', WRITE, 'name text', 'void', `
    begin
      delete from secrets where name = name;
    end`)
  .addMethod('setSecret', WRITE, 'name text, secret text, expires timestamp', 'void', `
    begin
      insert into secrets values (name, secret, expires)
      on conflict do update
      set secret=secret, expires=expires;
    end`);

module.exports = schema;
