export function formatTajikPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("992")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+992${groups.length ? ` ${groups.join(" ")}` : " "}`;
}

export function normalizeTajikPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("992") ? digits.slice(3) : digits;
  return local.length === 9 ? `+992${local}` : null;
}
