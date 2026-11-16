import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = {
  title: "Register — DineGo",
};

export default function RegisterPage() {
  return (
    <AuthCard
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-brand-soft hover:text-brand">
              Login
            </Link>
          </span>
          <Link href="/" className="transition hover:text-fg">
            Back to home
          </Link>
        </div>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
