import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Typography from '@material-ui/core/Typography';
import Entry from './Entry';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import Anchor from '../components/Anchor';
import findRefDoc from '../../../utils/findRefDoc';

@withRouter
export default class LogsReference extends Component {
  static propTypes = {
    // the service name to document
    serviceName: string.isRequired,
  };

  render() {
    const { serviceName } = this.props;
    const { ref, version } = findRefDoc({ type: 'logs', serviceName });

    if (version !== 0) {
      throw new Error(`Reference document version ${version} not supported`);
    }

    const commonLogTypes = ref.types.filter(l => l.type.startsWith('monitor.'));
    const serviceLogTypes = ref.types.filter(
      l => !l.type.startsWith('monitor.')
    );

    return (
      <div>
        {ref.title && (
          <HeaderWithAnchor>{ref.title || 'Logs'}</HeaderWithAnchor>
        )}
        {ref.description && (
          <MDX components={components}>{ref.description}</MDX>
        )}
        <Typography variant="body2">
          For more information on how to interpret logs, see{' '}
          <Anchor href="/docs/manual/design/logs">
            Interpreting Log Types
          </Anchor>{' '}
          in the manual
        </Typography>
        <br />
        {serviceLogTypes && Boolean(serviceLogTypes.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Service Message Types</HeaderWithAnchor>
            <Typography variant="body2">
              These message types are defined by this service in particular.
            </Typography>
            <br />
            {serviceLogTypes.map(entry => (
              <Entry
                key={`${entry.type}`}
                type="logs"
                entry={entry}
                serviceName={ref.serviceName}
              />
            ))}
            <br />
          </Fragment>
        )}
        {commonLogTypes && Boolean(commonLogTypes.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Common Message Types</HeaderWithAnchor>
            <Typography variant="body2">
              These message types are written by all Taskcluster services.
            </Typography>
            <br />
            {commonLogTypes.map(entry => (
              <Entry
                key={`${entry.type}`}
                type="logs"
                entry={entry}
                serviceName={ref.serviceName}
              />
            ))}
            <br />
          </Fragment>
        )}
      </div>
    );
  }
}
