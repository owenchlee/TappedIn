import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "@/components/autoapply/ProfileForm";
import { readProfile } from "@/lib/autoapply/profile";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default function ProfilePage() {
  // Lives in private/profile.json on this laptop only, like the rest of auto-apply.
  if (process.env.AUTO_APPLY_ENABLED !== "1") notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Profile"
        description="The answers auto-apply types into every application form. Stored only on this laptop, in private/profile.json."
      />
      <ProfileForm profile={readProfile()} />
    </div>
  );
}
