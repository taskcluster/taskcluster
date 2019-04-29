import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import SchemaPanel from './SchemaPanel';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import references from '../../../../../generated/references.json';

@withRouter
export default class Schema extends Component {
  static propTypes = {
    // the service name to document
    serviceName: string.isRequired,
    // the version of that service to document
    apiVersion: string.isRequired,
  };

  render() {
    const { serviceName } = this.props;

    return (
      <div>
        <HeaderWithAnchor>Universal Schema Viewer</HeaderWithAnchor>
        {references && Boolean(references.length) && (
          <Fragment>
            {references.map(entry => (
              <SchemaPanel
                key={entry.$id}
                serviceName={serviceName}
                type="schema"
                entry={entry}
              />
            ))}
          </Fragment>
        )}
      </div>
    );
  }
}
