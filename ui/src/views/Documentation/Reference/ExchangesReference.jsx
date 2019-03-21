import React, { Component, Fragment } from 'react';
import { object } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Entry from './Entry';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';

@withRouter
export default class ExchangesReference extends Component {
  static propTypes = {
    // the parsed reference document
    json: object.isRequired,
  };

  render() {
    const { json } = this.props;
    const topicExchangeEntries =
      json.entries &&
      json.entries.filter(({ type }) => type === 'topic-exchange');

    return (
      <div>
        {json.title && <HeaderWithAnchor>{json.title}</HeaderWithAnchor>}
        {json.description && (
          <MDX components={components}>{json.description}</MDX>
        )}
        {topicExchangeEntries && Boolean(topicExchangeEntries.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Exchanges</HeaderWithAnchor>
            {topicExchangeEntries.map(entry => (
              <Entry
                key={entry.name}
                type="topic-exchange"
                entry={entry}
                exchangePrefix={json.exchangePrefix}
                serviceName={json.serviceName}
              />
            ))}
          </Fragment>
        )}
      </div>
    );
  }
}
