const chalk = require('chalk');

class Config {
  constructor({monitor, order}) {
    const env = (name, dfl, convert = x=>x) => {
      if (process.env[name]) {
        this[name] = process.env[name];
      } else if (dfl === undefined) {
        throw new Error(`Env var ${name} is required`);
      } else {
        this[name] = dfl;
      }
    };

    env('AZURE_ACCOUNT');
    env('AZURE_ACCOUNT_KEY');
    env('ADMIN_DB_URL');
    env('CONCURRENCY', 30, parseInt);

    monitor.output_fn(order, () => this.renderConfig());
  }

  renderConfig() {
    const adminDbUrl = new URL(this.ADMIN_DB_URL);
    adminDbUrl.password = '***';

    return [
      chalk`{bold Azure Account}: ${this.AZURE_ACCOUNT}\n`,
      chalk`{bold Postgres URL}: ${adminDbUrl}\n`,
    ].join('');
  }
}

exports.Config = Config;
