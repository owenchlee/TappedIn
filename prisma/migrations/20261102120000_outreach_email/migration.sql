-- CreateTable
CREATE TABLE "OutreachEmail" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactInfo" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "resume" TEXT NOT NULL DEFAULT 'software',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachEmail_status_followUpAt_idx" ON "OutreachEmail"("status", "followUpAt");
