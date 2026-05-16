// src/components/supplier/form-primitives.tsx
// Shared Industrial Console primitives for supplier form, view, and edit panels.
// Pair with: forms-industrial.css
import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import './forms-industrial.css';

/* ── Section card ───────────────────────────────────────────────── */
export function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="im-section">
      <div className="im-section__header">
        <div className="im-section__title">// {label}</div>
        <div className="im-section__sub">{sub}</div>
      </div>
      <div className="im-section__body">{children}</div>
    </div>
  );
}

/* ── Field label ────────────────────────────────────────────────── */
export function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="im-field-label">
      {children}
      {required && <span className="im-field-label__req">*</span>}
    </label>
  );
}

/* ── Text input ─────────────────────────────────────────────────── */
export interface FormInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'className'
> {
  hasError?: boolean;
  mono?: boolean;
}
export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  function FormInput({ hasError, mono, readOnly, ...rest }, ref) {
    return (
      <input
        ref={ref}
        readOnly={readOnly}
        className={cn(
          'im-input',
          hasError && 'is-error',
          readOnly && 'is-readonly',
          mono && 'is-mono'
        )}
        {...rest}
      />
    );
  }
);

/* ── Field error message ────────────────────────────────────────── */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="im-error-msg">
      <AlertTriangle size={11} /> {message}
    </p>
  );
}

/* ── Active/Inactive toggle ─────────────────────────────────────── */
export function ActiveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
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
        <span className="im-active-toggle__label">Active supplier</span>
      </span>
      <span className="im-active-toggle__state">
        {checked ? 'LISTED AS ACTIVE' : 'LISTED AS INACTIVE'}
      </span>
    </button>
  );
}

/* ── View-mode read-only field ──────────────────────────────────── */
export function ViewField({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  full?: boolean;
}) {
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

/* ── View-mode boolean field (status pill) ──────────────────────── */
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
      <span
        className={cn(
          'im-status-pill',
          value ? 'im-status-pill--active' : 'im-status-pill--inactive'
        )}
      >
        <span className="im-status-pill__dot" />
        {value ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </div>
  );
}

/* ── Identity header (View + Edit panels) ───────────────────────── */
export function IdentityHeader({
  name,
  sub,
  id,
  isActive,
  country,
  actions,
}: {
  name: string;
  sub: string;
  id: string;
  isActive: boolean;
  country?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="im-identity-header">
      <div className="im-identity-header__body">
        <h2>{name}</h2>
        <p className="im-identity-header__sub">{sub}</p>
        <div className="im-identity-header__tags">
          <span className="im-tag-mono">{id}</span>
          <span
            className={cn(
              'im-status-pill',
              isActive ? 'im-status-pill--active' : 'im-status-pill--inactive'
            )}
          >
            <span className="im-status-pill__dot" />
            {isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
          <span className="im-tag-mono im-tag-mono--faint">
            {country || 'COUNTRY NOT SET'}
          </span>
        </div>
      </div>
      {actions}
    </header>
  );
}

/* ── Form footer ────────────────────────────────────────────────── */
export function FormFooter({
  note,
  noteType,
  children,
}: {
  note?: string;
  noteType?: 'info' | 'warn';
  children: React.ReactNode;
}) {
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
