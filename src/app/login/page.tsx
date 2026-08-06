import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth, signIn } from "@/auth";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Input } from "@/features/ui-kit/field";

type LoginPageProps = { searchParams: Promise<{ error?: string; reset?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await auth()) redirect("/dashboard");
  const { error, reset } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        identifier: formData.get("identifier"),
        password: formData.get("password"),
        redirectTo: "/dashboard",
      });
    } catch (signInError) {
      if (signInError instanceof AuthError) redirect("/login?error=credentials");
      throw signInError;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className="flex size-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
              aria-hidden
            >
              MC
            </span>
            <p className="text-sm font-medium text-muted-foreground">ManClient для бизнеса</p>
            <h1 className="text-2xl font-bold text-foreground">Войдите в кабинет</h1>
            <p className="text-sm text-muted-foreground">
              Управляйте записями, услугами и расписанием своего бизнеса.
            </p>
          </div>
          <form action={login} className="flex flex-col gap-4">
            <Field label="Телефон или электронная почта">
              <Input name="identifier" autoComplete="username" required />
            </Field>
            <Field label="Пароль">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            {error ? (
              <p className="text-[13px] text-destructive" role="alert">
                Почта или пароль не подошли. Проверьте данные и попробуйте ещё раз.
              </p>
            ) : null}
            {reset === "done" ? (
              <p className="text-[13px] text-muted-foreground" role="status">
                Пароль изменён. Войдите с новым паролем.
              </p>
            ) : null}
            <Button type="submit" size="lg">
              Войти в кабинет
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link className="font-medium text-primary hover:underline" href="/reset-password">Забыли пароль?</Link>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Ещё нет кабинета? <Link className="font-medium text-primary hover:underline" href="/register">Создать бизнес</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
