// src/components/shared/im/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Industrial Console — Shared Component Library
// Import what you need: import { PageHeader, Toolbar, StatusBar, … } from '@/components/shared/im'
// All CSS comes from: src/styles/im-components.css (already imported in index.css)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/* ── AppBar (top chrome) ────────────────────────────────────────── */
interface AppBarProps {
  crumbs: string[];
  right?: React.ReactNode;
}
export function AppBar({ crumbs, right }: AppBarProps) {
  return (
    <div className="im-app-bar">
      <div className="im-app-bar__crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span className="im-app-bar__sep">›</span>}
            <span
              className={cn(
                'im-app-bar__crumb',
                i === crumbs.length - 1 && 'im-app-bar__crumb--active'
              )}
            >
              {c}
            </span>
          </span>
        ))}
      </div>
      {right && <div className="im-app-bar__right">{right}</div>}
    </div>
  );
}

/* ── PageHeader (list pages) ────────────────────────────────────── */
interface PageHeaderProps {
  title: string;
  count?: number;
  subtitle?: string;
  actions?: React.ReactNode;
}
export function PageHeader({
  title,
  count,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="im-page-header">
      <div className="im-page-header__title-block">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1>{title}</h1>
          {count !== undefined && (
            <span className="im-record-badge">{count} RECORDS</span>
          )}
        </div>
        {subtitle && <p className="im-page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="im-page-header__actions">{actions}</div>}
    </div>
  );
}

/* ── Toolbar (search + filter + extras) ─────────────────────────── */
interface ToolbarProps {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: string[];
  activeFilter?: string;
  onFilter?: (f: string) => void;
  right?: React.ReactNode;
}
export function Toolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters,
  activeFilter,
  onFilter,
  right,
}: ToolbarProps) {
  return (
    <div className="im-toolbar">
      {onSearch && (
        <div className="im-search-wrap">
          <Search size={14} className="im-search-icon" />
          <input
            className="im-search-input"
            placeholder={searchPlaceholder}
            value={search ?? ''}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      )}
      {filters && filters.length > 0 && (
        <div className="im-filter-group">
          {filters.map(f => (
            <button
              key={f}
              className={cn('im-filter-btn', activeFilter === f && 'is-active')}
              onClick={() => onFilter?.(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

/* ── StatusBar (bottom bar) ─────────────────────────────────────── */
interface StatusBarProps {
  total: number;
  selected?: number;
  filtered?: number;
  page?: number;
  pages?: number;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  extra?: React.ReactNode;
}
export function StatusBar({
  total,
  selected = 0,
  filtered,
  page = 1,
  pages = 1,
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
  extra,
}: StatusBarProps) {
  return (
    <div className="im-status-bar">
      <span>
        Total:&nbsp;<strong>{total}</strong>
      </span>
      <span className="im-status-bar__sep">·</span>
      <span className={selected > 0 ? 'is-accent' : ''}>
        Selected:&nbsp;<strong>{selected}</strong>
      </span>
      {filtered !== undefined && (
        <>
          <span className="im-status-bar__sep">·</span>
          <span>
            Filtered:&nbsp;<strong>{filtered}</strong>
          </span>
        </>
      )}
      {extra}
      <div className="im-status-bar__right">
        <span className="im-status-bar__pipe">|</span>
        <span>
          Page {page} of {pages}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className="im-page-btn"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronLeft size={11} />
          </button>
          <button
            className="im-page-btn"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ImStatusPill ───────────────────────────────────────────────── */
type PillVariant =
  | 'active'
  | 'inactive'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'accent';
interface StatusPillProps {
  label: string;
  variant?: PillVariant;
}
export function ImStatusPill({ label, variant = 'neutral' }: StatusPillProps) {
  return (
    <span className={`im-status-pill im-status-pill--${variant}`}>
      <span className="im-status-pill__dot" />
      {label.toUpperCase()}
    </span>
  );
}

/* ── KPI Tile ───────────────────────────────────────────────────── */
interface KpiTileProps {
  label: string;
  value: string | number;
  sub?: string;
  variant?: 'default' | 'good' | 'bad' | 'warning' | 'accent';
  link?: string;
}
export function KpiTile({
  label,
  value,
  sub,
  variant = 'default',
  link,
}: KpiTileProps) {
  const accentColor =
    variant === 'good'
      ? 'var(--color-im-good)'
      : variant === 'bad'
        ? 'var(--color-im-bad)'
        : variant === 'warning'
          ? '#FB923C'
          : variant === 'accent'
            ? 'var(--color-im-accent)'
            : 'var(--color-im-accent)';

  const content = (
    <div className="im-kpi">
      <div
        className="im-kpi__accent-line"
        style={{ background: accentColor }}
      />
      <div className="im-kpi__label">{label}</div>
      <div className={cn('im-kpi__value', variant === 'accent' && 'is-accent')}>
        {value}
      </div>
      {sub && <div className="im-kpi__sub">{sub}</div>}
    </div>
  );
  return link ? (
    <Link to={link} style={{ textDecoration: 'none' }}>
      {content}
    </Link>
  ) : (
    content
  );
}

/* ── Section card ───────────────────────────────────────────────── */
interface SectionProps {
  label: string;
  sub?: string;
  children: React.ReactNode;
}
export function ImSection({ label, sub, children }: SectionProps) {
  return (
    <div className="im-section">
      <div className="im-section__header">
        <div className="im-section__title">// {label}</div>
        {sub && <div className="im-section__sub">{sub}</div>}
      </div>
      <div className="im-section__body">{children}</div>
    </div>
  );
}

/* ── Field label ────────────────────────────────────────────────── */
interface FieldLabelProps {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}
export function FieldLabel({ htmlFor, required, children }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="im-field-label">
      {children}
      {required && <span className="im-field-label__req">*</span>}
    </label>
  );
}

/* ── ImInput ────────────────────────────────────────────────────── */
interface ImInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  mono?: boolean;
}
export function ImInput({
  hasError,
  mono,
  readOnly,
  className,
  ...rest
}: ImInputProps) {
  return (
    <input
      readOnly={readOnly}
      className={cn(
        'im-input',
        hasError && 'is-error',
        readOnly && 'is-readonly',
        mono && 'is-mono',
        className
      )}
      {...rest}
    />
  );
}

/* ── ImSelect ───────────────────────────────────────────────────── */
interface ImSelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'className'
> {
  children: React.ReactNode;
}
export function ImSelect({ children, ...rest }: ImSelectProps) {
  return (
    <select className="im-select" {...rest}>
      {children}
    </select>
  );
}

/* ── ImTextarea ─────────────────────────────────────────────────── */
type ImTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className'
>;
export function ImTextarea(props: ImTextareaProps) {
  return <textarea className="im-textarea" {...props} />;
}

/* ── FieldError ─────────────────────────────────────────────────── */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="im-error-msg">
      <AlertTriangle size={11} />
      {message}
    </p>
  );
}

/* ── ActiveToggle ───────────────────────────────────────────────── */
interface ActiveToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}
export function ActiveToggle({ checked, onChange }: ActiveToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn('im-active-toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="im-active-toggle__main">
        <span className="im-active-toggle__box" aria-hidden>
          {checked && (
            <svg
              viewBox="0 0 10 10"
              width={9}
              height={9}
              fill="none"
              stroke="#100c04"
              strokeWidth={2.2}
            >
              <path d="M1.5 5l2.5 3 5-6" />
            </svg>
          )}
        </span>
        <span className="im-active-toggle__label">Active</span>
      </span>
      <span className="im-active-toggle__state">
        {checked ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </button>
  );
}

/* ── ImTabs ─────────────────────────────────────────────────────── */
interface ImTabsProps {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}
export function ImTabs({ tabs, active, onChange }: ImTabsProps) {
  return (
    <div className="im-tabs">
      {tabs.map(t => (
        <button
          key={t}
          className={cn('im-tab', active === t && 'is-active')}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ── ViewField ──────────────────────────────────────────────────── */
interface ViewFieldProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  full?: boolean;
}
export function ViewField({ label, value, mono, full }: ViewFieldProps) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div className="im-view-field__label">{label}</div>
      <div
        className={cn(
          'im-view-field__value',
          mono && 'is-mono',
          empty && 'is-empty'
        )}
      >
        {empty ? '—' : value}
      </div>
    </div>
  );
}

/* ── ViewBoolField ──────────────────────────────────────────────── */
export function ViewBoolField({
  label,
  value,
}: {
  label: string;
  value: boolean;
}) {
  return (
    <div>
      <div className="im-view-field__label">{label}</div>
      <ImStatusPill
        label={value ? 'Active' : 'Inactive'}
        variant={value ? 'active' : 'inactive'}
      />
    </div>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────── */
interface EmptyStateProps {
  title: string;
  sub: string;
  actions?: React.ReactNode;
}
export function EmptyState({ title, sub, actions }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={999} className="im-td-empty">
        <div className="im-empty-state">
          <div className="im-empty-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width={44}
              height={44}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="im-empty-title">{title}</p>
          <p className="im-empty-sub">{sub}</p>
          {actions && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {actions}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Modal ──────────────────────────────────────────────────────── */
interface ImModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}
export function ImModal({
  open,
  onClose,
  title,
  wide,
  children,
  footer,
}: ImModalProps) {
  if (!open) return null;
  return (
    <div className="im-modal-overlay" onClick={onClose}>
      <div
        className={cn('im-modal', wide && 'im-modal--wide')}
        onClick={e => e.stopPropagation()}
      >
        <div className="im-modal__header">
          <h2 className="im-modal__title">{title}</h2>
          <button className="im-btn-icon" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="im-modal__body">{children}</div>
        {footer && <div className="im-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Confirm Dialog ─────────────────────────────────────────────── */
interface ImConfirmProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}
export function ImConfirm({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger,
}: ImConfirmProps) {
  return (
    <ImModal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="im-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={cn(
              'im-btn',
              danger ? 'im-btn--danger' : 'im-btn--primary'
            )}
            onClick={onConfirm}
          >
            {danger ? 'Delete' : 'Confirm'}
          </button>
        </>
      }
    >
      <p className="im-confirm-msg">{message}</p>
    </ImModal>
  );
}

/* ── BreadcrumbBar ──────────────────────────────────────────────── */
interface BreadcrumbBarProps {
  backLabel: string;
  current: string;
  context?: string;
  contextIsDirty?: boolean;
  onBack?: () => void;
}
export function BreadcrumbBar({
  backLabel,
  current,
  context,
  contextIsDirty,
  onBack,
}: BreadcrumbBarProps) {
  return (
    <div className="im-breadcrumb">
      <button type="button" className="im-breadcrumb__back" onClick={onBack}>
        <ArrowLeft size={12} />
        {backLabel}
      </button>
      <span className="im-breadcrumb__sep">·</span>
      <span className="im-breadcrumb__crumb">{current}</span>
      {context && (
        <span
          className={cn('im-breadcrumb__ctx', contextIsDirty && 'is-dirty')}
        >
          {contextIsDirty ? '● ' : ''}
          {context}
        </span>
      )}
    </div>
  );
}

/* ── FormFooter ─────────────────────────────────────────────────── */
interface FormFooterProps {
  note?: string;
  noteType?: 'info' | 'warn';
  children: React.ReactNode;
}
export function FormFooter({ note, noteType, children }: FormFooterProps) {
  return (
    <footer className="im-form-footer">
      {note && (
        <span
          className={cn(
            'im-form-footer__note',
            noteType === 'warn' && 'is-warn'
          )}
        >
          {note}
        </span>
      )}
      <div className="im-form-footer__actions">{children}</div>
    </footer>
  );
}

/* ── IdentityHeader ─────────────────────────────────────────────── */
interface IdentityHeaderProps {
  name: string;
  sub: string;
  id: string;
  tags?: React.ReactNode;
  actions?: React.ReactNode;
}
export function IdentityHeader({
  name,
  sub,
  id,
  tags,
  actions,
}: IdentityHeaderProps) {
  return (
    <header className="im-identity-header">
      <div className="im-identity-header__body">
        <h2>{name}</h2>
        <p className="im-identity-header__sub">{sub}</p>
        <div className="im-identity-header__tags">
          <span className="im-tag">{id}</span>
          {tags}
        </div>
      </div>
      {actions}
    </header>
  );
}

/* ── ImToggle (settings switch) ─────────────────────────────────── */
interface ImToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}
export function ImToggle({ checked, onChange, id }: ImToggleProps) {
  return (
    <label className="im-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="im-toggle__track" />
      <span className="im-toggle__thumb" />
    </label>
  );
}

/* ── SettingsSection ────────────────────────────────────────────── */
interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="im-settings-section">
      <div className="im-settings-section__header">
        <div className="im-settings-section__title">// {title}</div>
      </div>
      <div className="im-settings-section__body">{children}</div>
    </div>
  );
}

/* ── SettingRow ─────────────────────────────────────────────────── */
interface SettingRowProps {
  label: string;
  desc?: string;
  children: React.ReactNode;
}
export function SettingRow({ label, desc, children }: SettingRowProps) {
  return (
    <div className="im-setting-row">
      <div>
        <div className="im-setting-row__label">{label}</div>
        {desc && <div className="im-setting-row__desc">{desc}</div>}
      </div>
      <div className="im-setting-row__control">{children}</div>
    </div>
  );
}

// Re-export ImCheckbox for table use
export function ImCheckbox(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    indeterminate?: boolean;
  }
) {
  const { indeterminate, ...rest } = props;
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="im-checkbox" {...rest} />;
}
