import React from 'react';
import { string } from 'prop-types';
import ErrorPanel from '../../../../components/ErrorPanel';

const Warning = ({ children }) => (
  <ErrorPanel warning error={children} onClose={null} />
);

Warning.propTypes = {
  children: string.isRequired,
};

export default Warning;
