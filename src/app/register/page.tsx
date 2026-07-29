import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";
import { RegistrationForm } from "@/features/onboarding/registration-form";

type RegisterPageProps = { searchParams: Promise<{ error?: string }> };

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await auth()) redirect("/dashboard/onboarding");
  const { error } = await searchParams;

  async function register(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    try {
      await registerBusiness({
        ownerName: String(formData.get("ownerName") ?? ""),
        email,
        password,
        businessName: String(formData.get("businessName") ?? ""),
        branchName: String(formData.get("branchName") ?? ""),
      });
    } catch (caught) {
      if (caught instanceof RegistrationError) {
        redirect(`/register?error=${caught.code === "EMAIL_ALREADY_USED" ? "email" : "input"}`);
      }
      throw caught;
    }
    await signIn("credentials", { email, password, redirectTo: "/dashboard/onboarding" });
  }

  const message = error === "email"
    ? "Эта почта уже используется. Войдите в существующий кабинет или укажите другую."
    : error === "input"
      ? "Проверьте заполненные поля. Пароль должен содержать минимум 12 символов."
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
