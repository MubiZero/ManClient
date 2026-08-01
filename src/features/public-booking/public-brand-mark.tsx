import Link from "next/link";

export function PublicBrandMark({
  slug,
  name,
  hasLogo,
  href,
}: {
  slug: string;
  name: string;
  hasLogo: boolean;
  href?: string;
}) {
  const className = "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-xs font-bold text-primary-foreground";
  const inner = hasLogo ? (
    <img src={`/api/public/businesses/${slug}/logo`} alt={name} className="size-full object-cover" />
  ) : (
    "MC"
  );

  if (href) {
    return (
      <Link href={href} aria-label={hasLogo ? name : "ManClient, главная"} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <span aria-hidden className={className}>
      {inner}
    </span>
  );
}
