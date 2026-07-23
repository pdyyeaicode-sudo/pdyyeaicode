export interface FeedbackEvent {
  requestId: string;
  eventType: "edit" | "rating" | "print_outcome" | "ab_choice";
  elementId?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  rating?: number;
  printOutcome?: "success" | "rejected_contrast" | "rejected_bleed" | "other";
}

export function logFeedback(event: FeedbackEvent): void {
  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch((err) => {
    console.error("Failed to log feedback", err);
  });
}
