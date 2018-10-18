# Taskcluster Web

This repository contains a collection of useful tools for use with Taskcluster.
Generally, we strive to not add UI to Taskcluster components, but instead offer
well documented APIs that can be easily consumed using a client library for
Taskcluster.

## Web Server

The taskcluster-web UI application relies on a server application in order to
perform queries to the Taskcluster APIs. That repo is
[taskcluster-web-server](https://github.com/taskcluster/taskcluster-web-server).
Clone that repo and follow the instructions for starting it prior to launching
the web UI. You will need to launch the web-server in a terminal
instance separate from the UI in order to run both simultaneously.

For development, the tc-web-server process must be serving on
http://localhost:3050, but otherwise need not be publicly accessible. The
development server for this repo will proxy requests as necessary to
http://localhost:3050.

## Environment

To get started local development, create a file in the root of the repo named
`.env` with the following content:

```bash
APPLICATION_NAME="Taskcluster"
GRAPHQL_SUBSCRIPTION_ENDPOINT="ws://localhost:5080/subscription"
```

_Note: The `APPLICATION_NAME` can be whatever you wish it to be._

You can optionally specify the port on which the development server serves with

```bash
PORT=9000
```

### Auth0 Config

**Note:** At the preset, this web application relies on an Auth0 client for
performing authenticated interactions with the Taskcluster APIs via the
taskcluster-web-server. In order to perform this authentication flow locally,
you will need the following environment variables. Specify them in your `.env`
file and they will be picked up automatically when starting this web app:

```bash
APPLICATION_NAME="Taskcluster"
GRAPHQL_SUBSCRIPTION_ENDPOINT="ws://localhost:5080/subscription"
AUTH0_DOMAIN="auth.mozilla.auth0.com"
AUTH0_CLIENT_ID="29t2n3LKKnyTbGtWmfTkQpau0mp7QmMH"
AUTH0_REDIRECT_URI="http://localhost:5080/login"
AUTH0_RESPONSE_TYPE="token id_token"
AUTH0_SCOPE="openid profile"
PORT="5080"
```

This Auth0 client is real, but can only be used locally on `localhost:5080`, so
the development server must be run with `PORT=5080`, and accessed at
http://localhost:5080 in the browser.

### Tracking Events

Google Analytics can be leveraged to track page views and click events.
Set up Analytics by including a the tracking ID (a string like UA-XXXXXXXX) environment variable.

```bash
GA_TRACKING_ID=XXXXXXXX
```

Once the tracking code is identified, the client will send a page event on each page view.
Moreover, the `Button` component is able to send an event when clicked by setting
the Button's `track` property.

## Icons

You can browse a list of available icons at:

https://materialdesignicons.com/

These can be imported into the app by using the Pascal-cased name of the icon from the
[`mdi-react`](https://github.com/levrik/mdi-react) package<sup>*</sup>.
For example, if you would like to use the `book-open-page-variant` icon, you can import it with:

```jsx
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';

// ...

<BookOpenPageVariantIcon />
```

<sup>* We use this library because it provides substantially more icons with minimal file-system headaches.</sup>
