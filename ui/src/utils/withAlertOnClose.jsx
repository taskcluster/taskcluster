import React, { Component } from 'react';

// Ask the user for confirmation to leave the page.
// This is useful to use when a page has a form.
export default WrappedComponent =>
  class withAlertOnClose extends Component {
    componentDidMount = () => {
      // A generic string not under the control of the web page
      // will be shown instead of the returned string.
      // Custom text is not well supported yet.
      window.addEventListener('beforeunload', this.keepOnPage);
    };

    componentWillUnmount = () => {
      window.removeEventListener('beforeunload', this.keepOnPage);
    };

    keepOnPage = e => {
      e.preventDefault();
      e.returnValue = true;
    };

    render() {
      return <WrappedComponent {...this.props} />;
    }
  };
