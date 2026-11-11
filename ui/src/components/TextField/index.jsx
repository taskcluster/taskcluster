import React from 'react';
import MuiTextField from '@mui/material/TextField';

function TextField({ ...props }) {
  return <MuiTextField color="secondary" {...props} />;
}

export default TextField;
