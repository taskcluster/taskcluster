import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import { withAuth } from '../../../utils/Auth';
import { getArtifactUrl } from '../../../utils/getArtifactUrl';

@withAuth
export default class TaskArtifactRedire extends Component {
  state = {
    redirect: false,
  };

  componentDidMount() {
    const {
      match: {
        params: { artifactName, taskId, runId },
      },
      user,
    } = this.props;
    const url = getArtifactUrl({ user, taskId, runId, name: artifactName });

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
