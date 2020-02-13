import React from 'react';
import MuiTextField from '@material-ui/core/TextField';

function TextField({ ...props }) {
  return <MuiTextField color="secondary" {...props} />;
}

export default TextField;
