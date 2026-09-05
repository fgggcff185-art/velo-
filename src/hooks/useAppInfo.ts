import { useEffect, useState } from 'react';

export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  ptyAvailable: boolean;
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    window.velo.getAppInfo().then(setInfo).catch(() => undefined);
  }, []);
  return info;
}
