import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";
import { assertRateLimit, RateLimitedError } from "@/core/security/rate-limit";
import { RegistrationForm } from "@/features/onboarding/registration-form";
import { normalizeTajikPhone } from "@/features/onboarding/tajik-phone";
import { Card, CardContent } from "@/features/ui-kit/card";

type RegisterPageProps = { searchParams: Promise<{ error?: string }> };

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await auth()) redirect("/dashboard/onboarding");
  const { error } = await searchParams;

  async function register(formData: FormData) {
    "use server";
    const phone = normalizeTajikPhone(String(formData.get("phone") ?? "")) ?? "";
    const password = String(formData.get("password") ?? "");
    try {
      // Registration creates a business, a user and an audit trail; five per hour per address is far
      // above any real signup rate and far below what a script needs to be worth writing.
      const forwardedFor = (await headers()).get("x-forwarded-for");
      await assertRateLimit("auth.register", `ip:${forwardedFor?.split(",")[0]?.trim() || "unknown"}`);
      await registerBusiness({
        ownerName: String(formData.get("ownerName") ?? ""),
        phone,
        password,
        businessName: String(formData.get("businessName") ?? ""),
      });
    } catch (caught) {
      if (caught instanceof RateLimitedError) {
        redirect("/register?error=throttled");
      }
      if (caught instanceof RegistrationError) {
        redirect(`/register?error=${caught.code === "PHONE_ALREADY_USED" ? "phone" : "input"}`);
      }
      throw caught;
    }
    await signIn("credentials", { identifier: phone, password, redirectTo: "/dashboard/onboarding" });
  }

  const message = error === "phone"
    ? "Этот номер уже используется. Войдите в существующий кабинет или укажите другой."
    : error === "input"
      ? "Проверьте заполненные поля. Пароль должен содержать минимум 8 символов."
      : error === "throttled"
        ? "Слишком много попыток регистрации. Попробуйте снова через час."
        : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className="flex size-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
              aria-hidden
            >
              MC
            </span>
            <p className="text-sm font-medium text-muted-foreground">Новый бизнес в ManClient</p>
            <h1 className="text-2xl font-bold text-foreground">Создайте кабинет бизнеса</h1>
            <p className="text-sm text-muted-foreground">
              Начните на сайте. Позже вы создадите одного Telegram-бота для клиентов, а команда будет
              работать через готовый @manclient_bot.
            </p>
          </div>
          <RegistrationForm action={register} error={message} />
        </CardContent>
      </Card>
    </main>
  );
}
