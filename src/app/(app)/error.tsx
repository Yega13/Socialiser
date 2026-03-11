"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <h2 className="text-2xl font-black text-[#0A0A0A]">Something went wrong</h2>
      <p className="text-sm text-[#5C5C5A]">{error.message || "An unexpected error occurred."}</p>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
