import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, FolderOpen, Command } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useFileStore } from '../../store/useFileStore';
import { VeloLogo } from '../VeloLogo';
import { useT } from '../../services/i18n';

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const openPalette = useUIStore((s) => s.openPalette);
  const { root, rootName } = useFileStore();
  const tr = useT();

  useEffect(() => {
    const off = window.velo.onWindowMaximized(setMaximized);
    return off;
  }, []);

  const handleOpenFolder = async () => {
    const dir = await window.velo.openFolderDialog();
    if (dir) await useFileStore.getState().setRoot(dir);
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <VeloLogo size={18} />
        </div>
        <span className="titlebar-appname">{tr('appName')}</span>
        <button className="tb-btn" onClick={handleOpenFolder} title={tr('openFolderTitle')}>
          <FolderOpen size={14} />
        </button>
        <button className="tb-btn" onClick={() => openPalette('commands')} title={tr('commandPaletteTitle')}>
          <Command size={14} />
        </button>
      </div>
      <div className="titlebar-center">
        <span className="titlebar-workspace">{root ? rootName : tr('workspaceDefault')}</span>
      </div>
      <div className="titlebar-right">
        <button className="win-btn" onClick={() => window.velo.windowMinimize()} title="Minimize">
          <Minus size={14} />
        </button>
        <button className="win-btn" onClick={() => window.velo.windowMaximizeToggle()} title="Maximize">
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button className="win-btn win-close" onClick={() => window.velo.windowClose()} title="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
