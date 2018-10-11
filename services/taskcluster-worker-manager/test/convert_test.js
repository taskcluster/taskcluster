const path = require('path');
const fs = require('fs');
const assume = require('assume');
const {convert} = require('../bin/convert');

const {buildWorkerConfiguration} = require('../lib/worker-config');

const memory = require('memory-streams');

suite('AWS Provisioner WorkerType conversion', () => {
  test('should convert as expected', async () => {
    let output = new memory.WritableStream();
    let input = fs.createReadStream(path.join(__dirname, 'convert-input.json'));
    await convert(input, output);
    let expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'convert-expected.json')));
    let actual = JSON.parse(output.toBuffer());
    assume(actual).deeply.equals(expected);

    // It should be possible to create it!
    buildWorkerConfiguration(actual);
  });
});
