import type { Metadata } from "next"
import { AuthBrandingHeader } from "@/components/auth/auth-branding-header"
import { getServerBranding } from "@/lib/branding-server"

// A static "FreeFrame — Auth" here overrode the root layout's title, so the
// sign-in tab named the product no matter how the instance was branded. The
// name is resolved on the server for the same reason it is in the root layout:
// the tab is readable before any script has run.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getServerBranding()
  return { title: `${branding?.org_name || "Creative Flo"} — Auth` }
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-dvh bg-bg-primary pt-safe pb-safe pl-safe pr-safe [--ff-pt:2rem] [--ff-pb:2rem] [--ff-pl:1rem] [--ff-pr:1rem] flex flex-col items-center justify-center px-4">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/[0.04] blur-[120px]" />
      </div>

      {/* Branding header — shown on every auth screen (login, setup, invite) */}
      <AuthBrandingHeader />

      {/* Card */}
      <div className="relative min-w-0 w-full max-w-sm break-words rounded-xl border border-border bg-bg-secondary/50 backdrop-blur-sm p-6 shadow-xl animate-fade-in">
        {children}
      </div>

      {/* Footer */}
      <p className="relative mt-8 text-2xs text-text-tertiary">
        Create, review and approve videos with Flo
      </p>
    </div>
  )
}
