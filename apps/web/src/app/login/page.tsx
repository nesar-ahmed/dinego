import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Login — DineGo",
};

export default function LoginPage() {
  return (
    <AuthCard
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            New here?{" "}
            <Link href="/register" className="font-semibold text-brand-soft hover:text-brand">
              Register
            </Link>
          </span>
          <Link href="/" className="transition hover:text-fg">
            Back to home
          </Link>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
