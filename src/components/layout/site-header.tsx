import {
  CircleHelp,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  SidebarIcon,
  Sun,
} from 'lucide-react';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import { useTheme } from '@/components/layout/theme-context';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationSheet } from '@/components/notifications/NotificationSheet';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { AboutDialog } from '@/components/about-dialog';
import { CustomColorPicker } from '@/components/ui/custom-color-picker';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import {
  assertTrustworthySavePath,
  save,
  useNativeFileDialogs,
} from '@/lib/tauri-bridge';
import { useUser } from '@/lib/user-context';
import { useUpdater } from '@/hooks/useUpdater';
import { cn } from '@/lib/utils';

export function SiteHeader({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  const { theme, setTheme, toggleMode } = useTheme();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [notificationSheetOpen, setNotificationSheetOpen] = useState(false);
  const [customColorPickerOpen, setCustomColorPickerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const { user } = useUser();
  const { state: updaterState, checkForUpdates } = useUpdater();
  const isUpdating =
    updaterState.phase === 'checking' || updaterState.phase === 'downloading';
  const hasUpdate = updaterState.phase === 'available';

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as Window & { __E2E_openCustomAccent?: () => void };
    w.__E2E_openCustomAccent = () => setCustomColorPickerOpen(true);
    return () => {
      delete w.__E2E_openCustomAccent;
    };
  }, []);

  const handleViewAllNotifications = () => {
    if (isMobile) {
      setNotificationSheetOpen(true);
    } else {
      navigate('/notifications');
    }
  };

  const colorOptions: {
    key: typeof theme.color;
    label: string;
    swatchClass: string;
  }[] = [
    { key: 'zinc', label: 'Zinc', swatchClass: 'bg-zinc-500' },
    { key: 'slate', label: 'Slate', swatchClass: 'bg-slate-500' },
    { key: 'blue', label: 'Blue', swatchClass: 'bg-blue-500' },
    { key: 'cyan', label: 'Cyan', swatchClass: 'bg-cyan-500' },
    { key: 'teal', label: 'Teal', swatchClass: 'bg-teal-500' },
    { key: 'green', label: 'Green', swatchClass: 'bg-green-500' },
    { key: 'orange', label: 'Orange', swatchClass: 'bg-orange-500' },
    { key: 'red', label: 'Red', swatchClass: 'bg-red-500' },
    { key: 'purple', label: 'Purple', swatchClass: 'bg-purple-500' },
    { key: 'violet', label: 'Violet', swatchClass: 'bg-violet-500' },
    { key: 'indigo', label: 'Indigo', swatchClass: 'bg-indigo-500' },
    { key: 'sky', label: 'Sky', swatchClass: 'bg-sky-500' },
    { key: 'pink', label: 'Pink', swatchClass: 'bg-pink-500' },
    { key: 'rose', label: 'Rose', swatchClass: 'bg-rose-500' },
    { key: 'fuchsia', label: 'Fuchsia', swatchClass: 'bg-fuchsia-500' },
  ];

  const getThemeIcon = () => {
    switch (theme.mode) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      case 'system':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Sun className="h-4 w-4" />;
    }
  };

  const getThemeLabel = () => {
    switch (theme.mode) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'Light';
    }
  };

  const exportDiagnostics = async () => {
    if (!useNativeFileDialogs) {
      toast.message(
        'Export diagnostics is available in the desktop application.'
      );
      return;
    }
    const uid = user?.id?.trim();
    if (!uid) {
      toast.error('Sign in to export diagnostics.');
      return;
    }
    let outputPath: string | null;
    try {
      outputPath = await save({
        defaultPath: 'import-manager-diagnostics.zip',
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      });
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not open save dialog.'));
      return;
    }
    if (!outputPath) {
      return;
    }
    try {
      assertTrustworthySavePath(outputPath);
    } catch (pathErr) {
      toast.error(pathErr instanceof Error ? pathErr.message : String(pathErr));
      return;
    }
    setExportingDiagnostics(true);
    try {
      const clientReportedAppVersion =
        import.meta.env.VITE_APP_VERSION?.trim() || null;
      await invoke('export_diagnostics_bundle', {
        callerUserId: uid,
        outputPath,
        clientReportedAppVersion,
      });
      toast.success('Diagnostics bundle saved.');
    } catch (e) {
      const ipc = parseIpcError(e);
      const cid =
        ipc?.correlationId != null && ipc.correlationId !== ''
          ? ` Correlation: ${ipc.correlationId}.`
          : '';
      toast.error(`${ipcErrorMessage(e)}${cid}`);
    } finally {
      setExportingDiagnostics(false);
    }
  };

  return (
    <header
      style={{
        height: 42,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
        background: 'var(--color-im-sub)',
        borderBottom: '1px solid var(--color-im-rule)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}
      >
        <button
          className="im-btn-icon"
          onClick={onToggleSidebar}
          aria-label="Toggle Sidebar"
          style={{ border: 'none', color: 'var(--color-im-faint)' }}
        >
          <SidebarIcon size={16} />
        </button>
        <span style={{ color: 'var(--color-im-rule)', marginRight: 4 }}>|</span>

        {/* App Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-im-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'var(--color-im-text)',
              textTransform: 'uppercase',
            }}
          >
            Import Manager
          </span>
          <span style={{ color: 'var(--color-im-rule)', fontSize: 14 }}>|</span>
          <Breadcrumb className="hidden sm:flex" />
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="im-btn-icon"
                style={{ border: 'none' }}
                aria-label="Help"
                title="Help"
              >
                <CircleHelp size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={exportingDiagnostics}
                onSelect={() => {
                  void exportDiagnostics();
                }}
              >
                Export diagnostics…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
                About Import Manager
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void checkForUpdates()}
                disabled={isUpdating || updaterState.phase === 'done'}
              >
                <RefreshCw
                  className={cn(
                    'mr-2 h-4 w-4',
                    isUpdating && 'animate-spin',
                    hasUpdate && 'text-primary'
                  )}
                />
                {updaterState.phase === 'downloading'
                  ? 'Downloading...'
                  : isUpdating
                    ? 'Checking...'
                    : hasUpdate
                      ? 'Update available'
                      : 'Check for updates'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <NotificationBell onViewAll={handleViewAllNotifications} />

          {/* Theme Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="im-btn-icon" style={{ border: 'none' }}>
                {getThemeIcon()}
                <span className="sr-only">Toggle theme</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setTheme({ ...theme, mode: 'light' })}
              >
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme({ ...theme, mode: 'dark' })}
              >
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme({ ...theme, mode: 'system' })}
              >
                <Monitor className="mr-2 h-4 w-4" />
                <span>System</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Color Palette */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="im-btn-icon"
                style={{ border: 'none' }}
                data-testid="theme-color-menu-trigger"
                aria-label="Change theme color"
                title={`Theme color: ${theme.color}`}
              >
                <Palette size={16} />
                <span className="sr-only">Change theme color</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              style={{
                padding: 10,
                display: 'grid',
                gridTemplateColumns: 'repeat(5,1fr)',
                gap: 6,
                width: 140,
              }}
            >
              {colorOptions.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setTheme({ ...theme, color: c.key })}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 0,
                    border:
                      theme.color === c.key
                        ? '2px solid var(--color-im-accent)'
                        : '1px solid var(--color-im-rule)',
                    cursor: 'pointer',
                  }}
                  className={c.swatchClass}
                  title={c.label}
                />
              ))}
              {/* Custom Color Option */}
              <button
                type="button"
                onClick={() => setCustomColorPickerOpen(true)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 0,
                  border: '1px solid var(--color-im-rule)',
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Custom Color"
              >
                <Plus style={{ width: 10, height: 10, color: 'white' }} />
              </button>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick Theme Toggle for mobile */}
          <button
            className="im-btn-icon sm:hidden"
            style={{ border: 'none' }}
            onClick={toggleMode}
            title={`Current: ${getThemeLabel()}`}
          >
            {getThemeIcon()}
            <span className="sr-only">Toggle theme</span>
          </button>
        </div>
      </div>

      {/* Mobile Notification Sheet */}
      <NotificationSheet
        open={notificationSheetOpen}
        onOpenChange={setNotificationSheetOpen}
      />

      {/* Custom Color Picker Modal */}
      <CustomColorPicker
        open={customColorPickerOpen}
        onOpenChange={setCustomColorPickerOpen}
        initialColor={theme.customAccentColor}
      />

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </header>
  );
}
