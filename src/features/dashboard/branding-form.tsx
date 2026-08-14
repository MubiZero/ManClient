"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Input, Label } from "@/features/ui-kit/field";

const DEFAULT_COLOR = "#176b45";

export function BrandingForm({
  businessSlug,
  initialHasLogo,
  initialBrandColor,
}: {
  businessSlug: string;
  initialHasLogo: boolean;
  initialBrandColor: string | null;
}) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [logoVersion, setLogoVersion] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState(initialBrandColor ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // A blob URL lives until it is revoked or the document goes away, so every logo the owner tried on
  // stayed in memory with its image decoded. The ref holds the one currently on screen — state would
  // be a render behind, and the URL to release is the previous one.
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const displaySrc = preview ?? (hasLogo ? `/api/public/businesses/${businessSlug}/logo?v=${logoVersion}` : null);

  function replacePreview(next: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next ? URL.createObjectURL(next) : null;
    setFile(next);
    setPreview(previewUrlRef.current);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    replacePreview(event.target.files?.[0] ?? null);
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      if (file) body.set("logo", file);
      body.set("brandColor", brandColor);
      const response = await fetch("/api/dashboard/settings/branding", { method: "POST", body });
      const result = (await response.json()) as { hasLogo?: boolean; brandColor?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error);
      setHasLogo(Boolean(result.hasLogo));
      setLogoVersion(Date.now());
      replacePreview(null);
      setNotice("Брендинг сохранён");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeLogo() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("removeLogo", "true");
      const response = await fetch("/api/dashboard/settings/branding", { method: "POST", body });
      const result = (await response.json()) as { hasLogo?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error);
      setHasLogo(Boolean(result.hasLogo));
      setLogoVersion(Date.now());
      setNotice("Логотип удалён");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="flex flex-col gap-2">
          <Label>Логотип</Label>
          <div className="flex items-center gap-4">
            {displaySrc ? (
              <img src={displaySrc} alt="Логотип бизнеса" className="size-16 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
                Нет лого
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="text-sm text-foreground" />
              {hasLogo && !file ? (
                <Button type="button" variant="quiet" size="sm" onClick={removeLogo} disabled={saving} className="self-start">
                  Удалить логотип
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">JPG, PNG или WebP, до 5 МБ. Будет уменьшен до 512×512.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-color-input">Фирменный цвет</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              className="size-10 cursor-pointer rounded-md border border-border p-0.5"
              aria-label="Выбрать фирменный цвет"
            />
            <Input id="brand-color-input" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="max-w-28" maxLength={7} />
          </div>
          <p className="text-[13px] text-muted-foreground">Выберите достаточно тёмный и насыщенный цвет — на нём будет светлый текст.</p>
        </div>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-primary" role="status">{notice}</p> : null}

        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_INPUT";
  return ({
    INVALID_INPUT: "Проверьте изображение (JPG/PNG/WebP до 5 МБ) и цвет в формате #rrggbb.",
    FORBIDDEN: "У вас нет доступа к настройке брендинга. Обратитесь к владельцу бизнеса.",
    NOT_FOUND: "Бизнес не найден.",
  } as Record<string, string>)[code] ?? "Не удалось сохранить. Попробуйте ещё раз.";
}
