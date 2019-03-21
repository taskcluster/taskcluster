import React, { Component, Fragment } from 'react';
import { object } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Typography from '@material-ui/core/Typography';
import Entry from './Entry';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import Anchor from '../components/Anchor';

@withRouter
export default class LogsReference extends Component {
  static propTypes = {
    // the parsed reference document
    json: object.isRequired,
  };

  render() {
    const { json } = this.props;
    const commonLogTypes = json.types.filter(l =>
      l.type.startsWith('monitor.')
    );
    const serviceLogTypes = json.types.filter(
      l => !l.type.startsWith('monitor.')
    );

    return (
      <div>
        {json.title && <HeaderWithAnchor>{json.title}</HeaderWithAnchor>}
        {json.description && (
          <MDX components={components}>{json.description}</MDX>
        )}
        {serviceLogTypes && Boolean(serviceLogTypes.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Service Message Types</HeaderWithAnchor>
            <Typography>
              For more information on interpreting the log types described here,
              see
              <Anchor href="/docs/manual/design/logs">
                Interpreting Log Types
              </Anchor>
              in the manual.
            </Typography>
            <br />
            {serviceLogTypes.map(entry => (
              <Entry
                key={`${entry.type}`}
                type="logs"
                entry={entry}
                serviceName={json.serviceName}
              />
            ))}
          </Fragment>
        )}
        {commonLogTypes && Boolean(commonLogTypes.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Common Message Types</HeaderWithAnchor>
            <Typography>
              For more information on interpreting the log types described here,
              see{' '}
              <Anchor href="/docs/manual/design/logs">
                Interpreting Log Types
              </Anchor>{' '}
              in the manual.
            </Typography>
            <br />
            {commonLogTypes.map(entry => (
              <Entry
                key={`${entry.type}`}
                type="logs"
                entry={entry}
                serviceName={json.serviceName}
              />
            ))}
          </Fragment>
        )}
      </div>
    );
  }
}
