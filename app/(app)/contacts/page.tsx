import type { Metadata } from "next";
import { Contact as ContactIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContactCard, NewContactButton } from "@/components/contacts/ContactCard";
import { SearchBox } from "@/components/SearchBox";

export const metadata: Metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const contains = { contains: q, mode: "insensitive" as const };
  const contacts = await prisma.contact.findMany({
    where: q ? { OR: [{ name: contains }, { company: contains }, { role: contains }, { notes: contains }] } : undefined,
    include: {
      applications: { include: { coopPosting: { select: { company: true, role: true } }, organization: { select: { name: true } } } },
    },
    orderBy: [{ followUpAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  const total = q ? await prisma.contact.count() : contacts.length;

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Recruiters, referrers, interviewers and mentors. Set a follow-up date and it lands on Today and your calendar."
        actions={
          <>
            <SearchBox placeholder="Search people…" />
            <NewContactButton />
          </>
        }
      />
      {total === 0 ? (
        <EmptyState
          icon={ContactIcon}
          title="No contacts yet"
          description="Add people here, or straight from an application's page so they're linked to it."
        />
      ) : contacts.length === 0 ? (
        <EmptyState title="Nobody matches that search" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              applications={c.applications.map((a) => ({
                id: a.id,
                label: a.coopPosting ? `${a.coopPosting.company} — ${a.coopPosting.role}` : (a.organization?.name ?? "Application"),
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
