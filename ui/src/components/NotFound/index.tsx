import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Emoticon from './Emoticon';

export default function NotFound({ isDocs = false }: { isDocs?: boolean }) {
  const theme = useTheme();

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        variant="h4"
        sx={{ fontFamily: 'Roboto', fontWeight: 500, mb: 10 }}>
        We couldn&apos;t find a page at that address.
      </Typography>
      <Box
        component={Emoticon}
        fill={theme.palette.text.primary}
        sx={{
          position: 'fixed',
          height: '50%',
          right: 0,
          width: isDocs
            ? { xs: '100%', md: `calc(100% - ${theme.docsDrawerWidth}px)` }
            : '100%',
        }}
      />
    </Box>
  );
}
