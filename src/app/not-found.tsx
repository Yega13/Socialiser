import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F9F9F7] flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div
          className="font-black text-[#EBEBEA] leading-none"
          style={{ fontSize: "clamp(6rem, 20vw, 12rem)" }}
        >
          404
        </div>
        <h1 className="text-2xl font-black text-[#0A0A0A]">Page not found</h1>
        <p className="text-[#5C5C5A]">The page you're looking for doesn't exist.</p>
        <Link href="/">
          <Button size="lg">Go home</Button>
        </Link>
      </div>
    </div>
  );
}
