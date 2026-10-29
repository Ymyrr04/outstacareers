import { useEffect, useState } from 'react';
export function AnnouncementImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={file.name} className="max-h-96 max-w-full rounded-md object-contain" /> : null;
}