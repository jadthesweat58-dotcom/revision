"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows "Saving…" while the form is being sent. */
export default function SubmitButton({
  children,
  className = "btn",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}
