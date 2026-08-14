import { cloneElement, isValidElement, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from "react";

import { cn } from "@/features/ui-kit/cn";

// 48px tall to stay above the touch minimum, and `text-base` because Safari on iOS zooms the whole
// page in when it focuses a control whose text is under 16px — the owner then has to pinch back out
// between every field.
const fieldControlClass =
  "flex h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldControlClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldControlClass, "h-auto min-h-24 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldControlClass, "appearance-none pr-8", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const messageId = `${id}-message`;
  /**
   * The message under a field has to be attached to it, not merely near it. `aria-invalid` is what makes
   * the control read as rejected and what the `aria-[invalid=true]` styling above hangs on; the describedby
   * link is how the reason is read out at all, since a screen reader announces the label and then stops.
   * `role="alert"` speaks it the moment it appears, for the person who has already moved on.
   */
  const described = error || hint ? messageId : undefined;
  const control =
    isValidElement(children)
      ? cloneElement(children as ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
          ...(htmlFor ? {} : { id: (children as ReactElement<{ id?: string }>).props.id ?? id }),
          ...(error ? { "aria-invalid": true } : {}),
          ...(described ? { "aria-describedby": described } : {}),
        })
      : children;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error ? (
        <p id={messageId} role="alert" className="text-[13px] text-destructive">{error}</p>
      ) : hint ? (
        <p id={messageId} className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
