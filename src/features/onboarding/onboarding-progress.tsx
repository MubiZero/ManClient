const steps = ["Услуга", "Оплата", "Готово"] as const;

export function OnboardingProgress({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <ol className="onboarding-progress" aria-label="Этапы настройки бизнеса">
      {steps.map((label, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const completed = number < currentStep;
        return (
          <li className={completed ? "is-complete" : number === currentStep ? "is-current" : undefined} key={label} aria-current={number === currentStep ? "step" : undefined}>
            <span aria-hidden>{completed ? "✓" : number}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
