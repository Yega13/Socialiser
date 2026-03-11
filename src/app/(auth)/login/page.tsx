import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Card className="bg-[#F9F9F7]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#0A0A0A]">Welcome back</h1>
        <p className="text-sm text-[#5C5C5A] mt-1">Sign in to your account</p>
      </div>
      {error && (
        <div className="mb-4 p-3 border border-[#FF4F4F] bg-[#FF4F4F]/10">
          <p className="text-xs text-[#FF4F4F] font-medium">Auth error: {error}</p>
        </div>
      )}
      <LoginForm />
    </Card>
  );
}
