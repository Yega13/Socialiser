import { RegisterForm } from "@/components/auth/register-form";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="bg-[#F9F9F7]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#0A0A0A]">Create your account</h1>
        <p className="text-sm text-[#5C5C5A] mt-1">Start cross-posting in minutes</p>
      </div>
      <RegisterForm />
    </Card>
  );
}
