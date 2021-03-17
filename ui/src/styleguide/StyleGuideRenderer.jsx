import React, { Fragment } from 'react';
import StyleGuide from 'react-styleguidist/lib/rsg-components/StyleGuide/StyleGuideRenderer';

const StyleGuideRenderer = props => (
  <Fragment>
    <StyleGuide {...props} />
  </Fragment>
);

export default StyleGuideRenderer;
