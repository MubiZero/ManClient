import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth, signIn } from "@/auth";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await auth()) redirect("/dashboard");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/dashboard",
      });
    } catch (signInError) {
      if (signInError instanceof AuthError) redirect("/login?error=credentials");
      throw signInError;
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand" aria-hidden>MC</div>
        <p className="context-label">ManClient для бизнеса</p>
        <h1>Войдите в кабинет</h1>
        <p className="login-intro">Управляйте записями, услугами и расписанием своего бизнеса.</p>
        <form action={login} className="login-form">
          <label className="field-label">Электронная почта<input className="text-input" name="email" type="email" autoComplete="email" required /></label>
          <label className="field-label">Пароль<input className="text-input" name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="form-error" role="alert">Почта или пароль не подошли. Проверьте данные и попробуйте ещё раз.</p>}
          <button className="primary-button" type="submit">Войти в кабинет</button>
          <p className="auth-switch">Ещё нет кабинета? <Link href="/register">Создать бизнес</Link></p>
        </form>
      </section>
    </main>
  );
}
