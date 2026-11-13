import React, { forwardRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { withStyles as tssWithStyles } from 'tss-react/mui';

export default (styles, { withTheme = false, ...options } = {}) =>
  Component => {
    // biome-ignore lint/correctness/noComponentHookFactories: decorator
    const Inner = forwardRef(({ className, ...props }, ref) => {
      const theme = useTheme();

      return (
        <Component
          ref={ref}
          {...(className !== undefined && { className })}
          {...(withTheme && { theme })}
          {...props}
        />
      );
    });

    Inner.displayName = Component.displayName || Component.name;

    return tssWithStyles(Inner, styles, options);
  };
