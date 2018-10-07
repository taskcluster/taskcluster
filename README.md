<p align="center">
  <a href="https://mozilla-frontend-infra-components.netlify.com">
    <img src="https://raw.githubusercontent.com/mozilla-frontend-infra/components/master/logo.png" alt="Logo" width=72 height=72>
  </a>

  <h3 align="center">Components</h3>

  <p align="center">
    Shareable React Components
    <br>
    <a href="https://mozilla-frontend-infra-components.netlify.com"><strong>Explore Components styleguide</strong></a>
  </p>
</p>

<br>

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]

## Requirements

* `@material-ui/core` v1.3.1+
* React, React DOM

## Getting started

```
# If using Yarn:
yarn add @mozilla-frontend-infra/components

# If using npm:
npm install --save @mozilla-frontend-infra/components
```

### Import

```js
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';

// using require
const ErrorPanel = require('@mozilla-frontend-infra/components/ErrorPanel').default;
```

## Development and Contributing

To get started:

- Fork and clone this repo.
- Install the dependencies with `yarn`.
- Start the development server with `yarn start`. This will launch a styleguide instance.
Open a browser to http://localhost:6060 to preview the React components.
- Use CTRL-C to exit the styleguide.
- Use `yarn build` to generate the compiled component for publishing to npm.

### Committing and Pushing changes

This project uses [semantic-release](https://github.com/semantic-release/semantic-release#readme)
to do automatic releases and generate a changelog based on the commit history. Please follow the
[ESLint convention](https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-eslint/README.md)
for commit messages so that we could properly determine the next semantic version number to publish and generate a changelog.

Feel free to open an issue, submit a pull request, or contribute however you would like. Understand that this
documentation is still a work in progress, so file an issue or submit a PR to ask questions or make improvements.
Thanks!

## Thanks

[![BrowserStack](https://www.browserstack.com/images/mail/browserstack-logo-footer.png)](https://www.browserstack.com/)

Thank you to [BrowserStack](https://www.browserstack.com/) for providing the infrastructure that allows us to test in real browsers.

[npm-image]: https://img.shields.io/npm/v/@mozilla-frontend-infra/components.svg
[npm-url]: https://www.npmjs.com/package/@mozilla-frontend-infra/components
[snyk-image]: https://snyk.io/test/github/mozilla-frontend-infra/components/badge.svg?targetFile=package.json
[snyk-url]: https://snyk.io/test/github/mozilla-frontend-infra/components?targetFile=package.json
[travis-image]: https://travis-ci.com/mozilla-frontend-infra/components.svg?branch=master
[travis-url]: https://travis-ci.com/mozilla-frontend-infra/components
