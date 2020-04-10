const chalk = require('chalk');

class Config {
  constructor({monitor, order}) {
    const env = (name, dfl, convert = x=>x) => {
      if (process.env[name]) {
        this[name] = convert(process.env[name]);
      } else if (dfl === undefined) {
        throw new Error(`Env var ${name} is required`);
      } else {
        this[name] = dfl;
      }
    };

    // Credentials
    env('AZURE_ACCOUNT');
    env('AZURE_ACCOUNT_KEY');
    env('ADMIN_DB_URL');

    // Number of operations to perform in parallel
    env('CONCURRENCY', 30, parseInt);

    // If set, exclude tables with encrypted or signed data
    env('EXCLUDE_CRYPTO', false, () => true);

    monitor.output_fn(order, () => this.renderConfig());
  }

  renderConfig() {
    const adminDbUrl = new URL(this.ADMIN_DB_URL);
    adminDbUrl.password = '***';

    return [
      chalk`{bold Azure Account}: ${this.AZURE_ACCOUNT}\n`,
      chalk`{bold Postgres URL}: ${adminDbUrl}\n`,
      chalk`{bold Concurrency}: ${this.CONCURRENCY}\n`,
      chalk`{bold Exclude Crypto}: ${this.EXCLUDE_CRYPTO}\n`,
    ].join('');
  }
}

exports.Config = Config;
