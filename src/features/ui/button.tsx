import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Сохраняем",
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; loadingLabel?: string }) {
  return (
    <button
      {...props}
      className={`ui-button ui-button-${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-button-spinner" aria-hidden /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; children: ReactNode }) {
  return <Link {...props} href={href} className={`ui-button ui-button-${variant} ${className}`.trim()}>{children}</Link>;
}
