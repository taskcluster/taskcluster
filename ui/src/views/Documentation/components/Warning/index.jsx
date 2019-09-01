import React from 'react';
import ErrorPanel from '../../../../components/ErrorPanel';

const Warning = ({ msg, keepOpen }) => (
  <ErrorPanel warning error={msg} onClose={keepOpen} />
);

export default Warning;
