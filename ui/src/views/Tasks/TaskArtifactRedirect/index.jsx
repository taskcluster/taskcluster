import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import { withAuth } from '../../../utils/Auth';
import { getArtifactUrl } from '../../../utils/getArtifactUrl';
import { getAnonymousScopes } from '../../../utils/anonymousScopes';
import {
  decodeArtifactName,
  getRawArtifactName,
} from '../../../utils/artifactNames';

@withAuth
export default class TaskArtifactRedirect extends Component {
  state = {
    redirect: false,
  };

  getRedirectUrl(anonymousScopes) {
    const {
      match: {
        params: { artifactName, taskId, runId },
      },
      user,
    } = this.props;
    const artifactPath = `/tasks/${taskId}/runs/${runId}/`;
    const rawArtifactName = getRawArtifactName(artifactPath, artifactName);

    return getArtifactUrl({
      user,
      anonymousScopes,
      taskId,
      runId,
      name: decodeArtifactName(rawArtifactName),
    });
  }

  async componentDidMount() {
    const url = this.getRedirectUrl(await getAnonymousScopes());

    window.location = url;

    setTimeout(() => {
      // in case of binaries and files that are forced to download
      // we need to redirect back to the run page to avoid showing empty spinner
      this.setState({ redirect: true });
    }, 2000);
  }

  render() {
    const {
      match: {
        params: { taskId, runId },
      },
    } = this.props;
    const { redirect } = this.state;

    return (
      <Dashboard>
        {!redirect && <Spinner />}
        {redirect && (
          <Redirect
            to={{
              pathname: `/tasks/${taskId}/runs/${runId}`,
            }}
          />
        )}
      </Dashboard>
    );
  }
}
