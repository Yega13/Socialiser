export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-[#C8FF00] rounded-full animate-spin" />
        <span className="text-sm text-[#5C5C5A] font-medium">Loading…</span>
      </div>
    </div>
  );
}
