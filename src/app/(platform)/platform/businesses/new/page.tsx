import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { RegistrationError, registerBusiness } from "@/core/onboarding/register-business";
import { Button } from "@/features/ui-kit/button";
import { Field, Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewBusinessPage({ searchParams }: PageProps) {
  const query = await searchParams;

  async function createBusiness(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    let businessId: string;
    try {
      const result = await registerBusiness({
        ownerName: String(formData.get("ownerName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        password: String(formData.get("password") ?? ""),
        businessName: String(formData.get("businessName") ?? ""),
      });
      businessId = result.businessId;
    } catch (error) {
      const code = error instanceof RegistrationError ? error.code : "INVALID_INPUT";
      redirect(`/platform/businesses/new?error=${code}`);
    }
    await writeAuditEvent({ businessId, type: "business.created_by_admin", actorType: "platform_admin", actorId: admin.userId });
    redirect(`/platform/businesses/${businessId}`);
  }

  return (
    <>
      <ToastEmitter error={errorMessage(query.error)} />
      <PageHeader eyebrow="Платформа" title="Создать бизнес" description="Создаёт бизнес, владельца и основной филиал напрямую, минуя self-serve регистрацию." />

      <form action={createBusiness} className="flex max-w-md flex-col gap-4">
        <Field label="Название бизнеса">
          <Input name="businessName" required minLength={2} maxLength={120} />
        </Field>
        <Field label="Имя владельца">
          <Input name="ownerName" required minLength={2} maxLength={80} />
        </Field>
        <Field label="Телефон владельца" hint="Формат +992XXXXXXXXX">
          <Input name="phone" required pattern="^\+992\d{9}$" placeholder="+992900000000" />
        </Field>
        <Field label="Временный пароль" hint="От 8 до 128 символов, владелец сможет сменить его позже">
          <Input name="password" type="password" required minLength={8} maxLength={128} />
        </Field>
        <Button type="submit" className="self-start">
          Создать бизнес
        </Button>
      </form>
    </>
  );
}

function errorMessage(code?: string) {
  return ({
    INVALID_INPUT: "Проверьте поля формы — что-то заполнено неверно.",
    PHONE_ALREADY_USED: "Этот номер телефона уже привязан к другому аккаунту.",
  } as Record<string, string>)[code ?? ""];
}
