import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isPhoneVerificationConfigured } from "@/core/security/phone-verification-service";
import { PasswordResetForm } from "@/features/auth/password-reset-form";
import { Card, CardContent } from "@/features/ui-kit/card";

export default async function ResetPasswordPage() {
  if (await auth()) redirect("/dashboard");
  const available = isPhoneVerificationConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-muted-foreground">ManClient для бизнеса</p>
            <h1 className="text-2xl font-bold text-foreground">Восстановление доступа</h1>
            <p className="text-sm text-muted-foreground">
              Мы отправим код в SMS на номер, которым вы регистрировали кабинет.
            </p>
          </div>
          {available ? (
            <PasswordResetForm />
          ) : (
            // The SMS template that carries the code is moderated by payom per account. Until it is
            // approved this page says so instead of sending the owner into a form that cannot work.
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Восстановление по SMS ещё не подключено на этой площадке. Напишите в поддержку — доступ вернут вручную.
              </p>
              <Link className="text-sm font-medium text-primary hover:underline" href="/login">
                Вернуться к входу
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
