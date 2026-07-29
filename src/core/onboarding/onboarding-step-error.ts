export type OnboardingStepErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "ALREADY_COMPLETED"
  | "CONFIGURATION_ERROR";

export class OnboardingStepError extends Error {
  constructor(public readonly code: OnboardingStepErrorCode) {
    super(code);
    this.name = "OnboardingStepError";
  }
}
