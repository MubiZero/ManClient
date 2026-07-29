import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";
import { RegistrationForm } from "@/features/onboarding/registration-form";
import { normalizeTajikPhone } from "@/features/onboarding/tajik-phone";

type RegisterPageProps = { searchParams: Promise<{ error?: string }> };

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await auth()) redirect("/dashboard/onboarding");
  const { error } = await searchParams;

  async function register(formData: FormData) {
    "use server";
    const phone = normalizeTajikPhone(String(formData.get("phone") ?? "")) ?? "";
    const password = String(formData.get("password") ?? "");
    try {
      await registerBusiness({
        ownerName: String(formData.get("ownerName") ?? ""),
        phone,
        password,
        businessName: String(formData.get("businessName") ?? ""),
      });
    } catch (caught) {
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
      : undefined;

  return (
    <main className="login-page registration-page">
      <section className="login-panel registration-panel">
        <div className="brand" aria-hidden>MC</div>
        <p className="context-label">Новый бизнес в ManClient</p>
        <h1>Создайте кабинет бизнеса</h1>
        <p className="login-intro">Начните на сайте. Telegram можно подключить позже как канал для клиентов и команды.</p>
        <RegistrationForm action={register} error={message} />
      </section>
    </main>
  );
}
