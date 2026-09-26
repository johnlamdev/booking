import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'

/**
 * 最小 UI 原語。刻意保持輕量，不引入 component library（規格 §17.5）。
 * a11y 要求：每個 control 有 label、錯誤可被 screen reader 讀出（規格 §13.4）。
 */

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60'
  const variants = {
    primary: 'bg-brand text-white shadow-sm hover:bg-brand-strong hover:shadow-md',
    secondary: 'border border-line bg-surface text-ink hover:border-brand/40 hover:bg-brand-soft',
    danger: 'border border-danger/30 bg-danger-soft text-danger hover:bg-danger/10',
  } as const

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

type ShellProps = {
  label: string
  /** 欄位說明，永久顯示，非錯誤訊息 */
  hint?: ReactNode
  error?: string
  required?: boolean
  controlId: string
  children: (ids: { id: string; describedBy?: string; invalid?: true }) => ReactNode
}

/** 共用的 label / hint / error 外殼，確保三種 control 的 a11y 行為一致。 */
function FieldShell({ label, hint, error, required, controlId, children }: ShellProps) {
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}

      {children({ id: controlId, describedBy, invalid: error ? true : undefined })}

      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const controlBase =
  'min-h-11 rounded-xl border bg-surface px-3 py-2.5 text-base text-ink shadow-sm placeholder:text-ink-subtle'
const borderFor = (error?: string) => (error ? 'border-danger' : 'border-line')

type FieldProps = ComponentPropsWithoutRef<'input'> & {
  label: string
  hint?: ReactNode
  error?: string
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, id, className = '', ...props },
  ref,
) {
  const controlId = id ?? props.name ?? label

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      controlId={controlId}
    >
      {({ id: inputId, describedBy, invalid }) => (
        <input
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${controlBase} ${borderFor(error)} ${className}`}
          {...props}
        />
      )}
    </FieldShell>
  )
})

type TextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  label: string
  hint?: ReactNode
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className = '', ...props },
  ref,
) {
  const controlId = id ?? props.name ?? label

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      controlId={controlId}
    >
      {({ id: textareaId, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={textareaId}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${controlBase} ${borderFor(error)} ${className}`}
          {...props}
        />
      )}
    </FieldShell>
  )
})

type SelectProps = ComponentPropsWithoutRef<'select'> & {
  label: string
  hint?: ReactNode
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className = '', children, ...props },
  ref,
) {
  const controlId = id ?? props.name ?? label

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      controlId={controlId}
    >
      {({ id: selectId, describedBy, invalid }) => (
        <select
          ref={ref}
          id={selectId}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${controlBase} ${borderFor(error)} ${className}`}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
})

/**
 * 訊息區塊。`role="alert"` 讓 screen reader 在內容出現時主動朗讀。
 * 一律同時使用文字與顏色，不單靠顏色傳達狀態。
 */
export function Alert({
  tone,
  children,
  className = '',
}: {
  tone: 'error' | 'notice' | 'success'
  children: ReactNode
  className?: string
}) {
  const styles = {
    error: 'border-danger/30 bg-danger-soft text-danger',
    notice: 'border-notice/30 bg-notice-soft text-notice',
    success: 'border-brand/30 bg-brand/5 text-brand-strong',
  } as const

  return (
    <p
      role="alert"
      className={`rounded-lg border px-3 py-2.5 text-sm ${styles[tone]} ${className}`}
    >
      {children}
    </p>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_8px_30px_rgb(23_33_29/0.04)] ${className}`}>{children}</div>
  )
}
