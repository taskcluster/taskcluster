import Box from '@mui/material/Box';
import CircularProgress, {
  type CircularProgressProps,
} from '@mui/material/CircularProgress';

export interface SpinnerProps extends CircularProgressProps {
  /** Render the spinner centered in its own block container. */
  loading?: boolean;
}

/**
 * Render an indeterminate spinning indicator.
 */
export default function Spinner({
  loading = false,
  className,
  sx = [],
  ...props
}: SpinnerProps) {
  if (!loading) {
    return <CircularProgress className={className} sx={sx} {...props} />;
  }

  return (
    <Box className={className} sx={[{ textAlign: 'center' }, ...[sx].flat()]}>
      <CircularProgress {...props} />
    </Box>
  );
}
