import copyToClipboard from 'copy-to-clipboard';
import { useEffect, useRef, useState } from 'react';

export default function useCopyToClipboard() {
  const [isCopy, setCopy] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const copy = (text: string) => {
    if (!copyToClipboard(text)) {
      return;
    }

    setCopy(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopy(false), 3000);
  };

  return { isCopy, copy };
}
