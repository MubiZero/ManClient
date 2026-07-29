import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  name,
  id = `field-${name}`,
  className = "",
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string; error?: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className={`ui-field ${className}`.trim()} htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <input {...inputProps} className="ui-input" id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error ? <span className="ui-field-error" id={`${id}-error`} role="alert">{error}</span> : hint ? <span className="ui-field-hint" id={`${id}-hint`}>{hint}</span> : null}
    </label>
  );
}
