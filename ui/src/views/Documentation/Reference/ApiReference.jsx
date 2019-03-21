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
export default class ApiReference extends Component {
  static propTypes = {
    // the parsed reference document
    json: object.isRequired,
  };

  render() {
    const { json } = this.props;
    const functionEntries =
      json.entries && json.entries.filter(({ type }) => type === 'function');

    return (
      <div>
        {json.title && <HeaderWithAnchor>{json.title}</HeaderWithAnchor>}
        {json.description && (
          <MDX components={components}>{json.description}</MDX>
        )}
        {functionEntries && Boolean(functionEntries.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Functions</HeaderWithAnchor>
            <Typography>
              For more information on invoking the API methods described here,
              see{' '}
              <Anchor href="/docs/manual/design/apis">Using the APIs</Anchor> in
              the manual.
            </Typography>
            <br />
            {functionEntries.map(entry => (
              <Entry
                key={`${entry.name}-${entry.query}`}
                type="function"
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
