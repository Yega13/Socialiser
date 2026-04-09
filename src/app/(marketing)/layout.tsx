import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SnakeText } from "@/components/ui/snake-text";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F7] dark:bg-[#0A0A0A]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <SnakeText />
      <Footer />
    </div>
  );
}
