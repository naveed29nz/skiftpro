import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { uploadObjectPath } from '@/lib/uploadUrl';

const HOUR = 60 * 60;

export function SignedUploadImage({ stored, alt = '', className, onClick }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const path = uploadObjectPath(stored);
    if (!path) {
      setSrc('');
      return undefined;
    }
    let cancel = false;
    supabase.storage.from('uploads').createSignedUrl(path, HOUR).then(({ data, error }) => {
      if (cancel) return;
      setSrc(!error && data?.signedUrl ? data.signedUrl : '');
    }).catch(() => {
      if (!cancel) setSrc('');
    });
    return () => {
      cancel = true;
    };
  }, [stored]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}
