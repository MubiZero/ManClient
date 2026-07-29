import {
  MarketingHomePage,
  normalizeTelegramOnboardingUrl,
} from "@/features/marketing/homepage";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const onboardingUrl = normalizeTelegramOnboardingUrl(
    process.env.NEXT_PUBLIC_ONBOARDING_TELEGRAM_URL,
  );

  return <MarketingHomePage onboardingUrl={onboardingUrl} />;
}
