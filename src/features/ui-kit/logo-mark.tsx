/**
 * ManClient mark: a heavy geometric M, brand green on white — the same idiom the rest of the
 * booking-software shelf uses (a single confident letter, no pictogram).
 *
 * Drawn as one filled path rather than a font glyph, so it renders identically everywhere and
 * needs no webfont. It carries its own margins inside the 512 viewBox, so render it at the full
 * size of its container and it will sit exactly as it does inside the generated PNG icons.
 *
 * The geometry is shared with scripts/generate-app-icons.ts; change both together.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M70 400V112h106l80 156 80-156h106v288h-76V236l-80 136h-60l-80-136v164z" />
    </svg>
  );
}
