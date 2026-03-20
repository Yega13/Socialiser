"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#F9F9F7] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-black text-[#0A0A0A]">500</h1>
        <p className="mt-2 text-lg text-[#5C5C5A]">Something went wrong</p>
        <button
          onClick={reset}
          className="mt-6 inline-block bg-[#0A0A0A] text-[#F9F9F7] px-6 py-3 font-bold text-sm hover:bg-[#7C3AED] transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
