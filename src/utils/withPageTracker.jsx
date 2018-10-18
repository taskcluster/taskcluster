import React, { Component } from 'react';
import ReactGA from 'react-ga';

let currentPage;

export default WrappedComponent =>
  class WithPageTracker extends Component {
    componentDidMount() {
      this.trackPage(window.location.pathname);
    }

    componentDidUpdate() {
      this.trackPage(window.location.pathname);
    }

    trackPage(page) {
      if (process.env.GA_TRACKING_ID && currentPage !== page) {
        currentPage = page;
        ReactGA.pageview(page);
      }
    }

    render() {
      return <WrappedComponent {...this.props} />;
    }
  };
