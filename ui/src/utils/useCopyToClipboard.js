import { useEffect, useState } from 'react';

function useCopyToClipboard() {
  const [isCopy, setCopy] = useState(false);

  function handleCopyClick() {
    setCopy(true);
  }

  useEffect(() => {
    if (isCopy) {
      setTimeout(() => {
        setCopy(false);
      }, 3000);
    }
  }, [isCopy]);

  return {
    onCopyClick: handleCopyClick,
    isCopy,
  };
}

export default useCopyToClipboard;
