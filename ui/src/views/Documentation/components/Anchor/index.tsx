import { styled } from '@mui/material/styles';
import type { ComponentPropsWithoutRef } from 'react';
import { Link } from 'react-router-dom';

interface AnchorProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
}

const ExternalLink = styled('a')(({ theme }) => theme.mixins.link);
const InternalLink = styled(Link)(({ theme }) => theme.mixins.link);

export default function Anchor({ href, ...props }: AnchorProps) {
  const url = new URL(href, window.location.href);

  if (url.origin !== window.location.origin) {
    return (
      <ExternalLink
        href={href}
        {...props}
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  }

  return <InternalLink to={url.pathname + url.search + url.hash} {...props} />;
}
