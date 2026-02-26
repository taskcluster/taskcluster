import helper from './helper.js';
import assert from 'assert';
import fs from 'fs';
import yaml from 'js-yaml';

helper.secrets.mockSuite('github-identifier-pattern', [], function(mock, skipping) {
  suiteSetup(async function() {
    if (skipping()) return;
    const constantsYaml = fs.readFileSync('../schemas/constants.yml', 'utf8');
    const constants = yaml.load(constantsYaml);

    this.githubPattern = new RegExp(constants['github-identifier-pattern']);
    this.minLength = constants['github-identifier-min-length'];
    this.maxLength = constants['github-identifier-max-length'];
  });

  function testLengthConstraints(id) {
    assert.ok(id.length >= this.minLength, `"${id}" is shorter than min length`);
    assert.ok(id.length <= this.maxLength, `"${id}" is longer than max length`);
  }

  test('valid GitHub identifiers', function() {
    const validIdentifiers = [
      'abc123',
      'org-name',
      'my_repo',
      'repo123',
      'ORG-Repo',
      'abc.def',
      'name_with_underscores',
      'name%repo',
      'percent%encoded',
      'a',
      'a'.repeat(100),
    ];

    validIdentifiers.forEach(id => {
      assert.ok(this.githubPattern.test(id), `Expected "${id}" to match github-identifier-pattern`);
      testLengthConstraints.call(this, id);
    });
  });

  test('invalid GitHub identifiers', function() {
    const invalidIdentifiers = [
      'with space',
      'repo!',
      'abc$123',
      '@org/repo',
      'org/repo',
      'org//repo',
      'repo#1',
      '😀emoji',
      'a'.repeat(101),
    ];

    invalidIdentifiers.forEach(id => {
      const matchesPattern = this.githubPattern.test(id);
      const exceedsLength = id.length > this.maxLength;
      assert.ok(!matchesPattern || exceedsLength, `Expected "${id}" to be invalid`);
    });
  });

  test('edge cases for GitHub identifiers', function() {
    const edgeCases = [
      'a-b_c',
      'repo-underscore_only_',
      'repo-dash-only-',
      'abc.def%ghi',
    ];
    edgeCases.forEach(id => {
      assert.ok(this.githubPattern.test(id), `Expected "${id}" to match github-identifier-pattern`);
      testLengthConstraints.call(this, id);
    });
  });
});
