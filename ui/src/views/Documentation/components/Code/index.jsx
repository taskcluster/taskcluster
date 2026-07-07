import React, { useContext } from 'react';
import { node } from 'prop-types';
import { SiteSpecificContext } from '../../../../components/SiteSpecific';

function substituteDeep(children, substitute) {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return substitute(child);
    }

    if (React.isValidElement(child)) {
      return React.cloneElement(
        child,
        undefined,
        substituteDeep(child.props.children, substitute)
      );
    }

    return child;
  });
}

export default function Code({ children, ...props }) {
  const substitute = useContext(SiteSpecificContext);
  const content = substitute ? substituteDeep(children, substitute) : children;

  return <code {...props}>{content}</code>;
}

Code.propTypes = {
  children: node,
};
