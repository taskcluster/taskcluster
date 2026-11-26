import Avatar from '@mui/material/Avatar';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import contributorsJson from '../../../../../.all-contributorsrc';

type Contributor = (typeof contributorsJson)['contributors'][number];

export default function People({
  filter,
}: {
  filter: (contributor: Contributor) => boolean;
}) {
  return (
    <Grid container spacing={1}>
      {contributorsJson.contributors.filter(filter).map(contrib => (
        <Grid key={contrib.login} size={{ xs: 4, sm: 3 }}>
          <Card>
            <CardActionArea
              href={contrib.profile}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                height: '100%',
                textAlign: 'center',
                borderBottom: 'none !important',
              }}>
              <CardContent>
                <Avatar
                  alt=""
                  src={contrib.avatar_url}
                  sx={{
                    height: 80,
                    width: 80,
                    mx: 'auto',
                    mb: 1,
                    boxShadow: '0px 0px 4px rgba(2,2,2,0.2)',
                  }}
                />
                <Typography variant="body2">{contrib.name}</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
