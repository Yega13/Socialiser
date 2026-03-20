import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F9F9F7] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-black text-[#0A0A0A]">404</h1>
        <p className="mt-2 text-lg text-[#5C5C5A]">Page not found</p>
        <Link
          href="/"
          className="mt-6 inline-block bg-[#0A0A0A] text-[#F9F9F7] px-6 py-3 font-bold text-sm hover:bg-[#7C3AED] transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
