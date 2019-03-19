import React, { Component } from 'react';
import { func } from 'prop-types';
import docsearch from 'docsearch.js/dist/cdn/docsearch';
import 'docsearch.js/dist/cdn/docsearch.css';
import Search from '../Search';

export default class DocSearch extends Component {
  static propTypes = {
    onSubmit: func.isRequired,
  };

  componentDidMount() {
    docsearch({
      apiKey: 'c7d22dbe731b27772278220687a87208',
      // Used for identification when using Algolia's API
      appId: 'FUFMXT38CF',
      indexName: 'taskcluster',
      inputSelector: '#algolia-doc-search',
      handleSelected: this.handleSelected,
    });
  }

  handleSelected = (input, event, suggestion) => {
    const { onSubmit } = this.props;
    const { url } = suggestion;
    const { pathname } = new URL(url);

    input.setVal('');
    onSubmit(pathname);
  };

  render() {
    return (
      <Search
        id="algolia-doc-search"
        placeholder="Search docs"
        aria-label="Search docs"
        {...this.props}
      />
    );
  }
}
