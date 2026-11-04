-- AlterTable
ALTER TABLE "OutreachEmail" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'founder',
ADD COLUMN "roleTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN "roleUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "contactTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN "source" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "OutreachEmail_kind_idx" ON "OutreachEmail"("kind");
