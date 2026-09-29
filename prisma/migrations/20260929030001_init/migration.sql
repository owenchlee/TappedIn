-- CreateTable
CREATE TABLE "CoopPosting" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "location" TEXT,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "sourceKey" TEXT,
    "externalKey" TEXT,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "region" TEXT,
    "postedAt" TIMESTAMP(3),
    "urlKey" TEXT,
    "titleKey" TEXT,
    "duplicateOfId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "missCount" INTEGER NOT NULL DEFAULT 0,
    "disappearedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "applicationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "deadline" TIMESTAMP(3),
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "lastCheckedAt" TIMESTAMP(3),
    "managed" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'seed',
    "location" TEXT,
    "region" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "watchLevel" TEXT,
    "watchYear" INTEGER,
    "watchedAt" TIMESTAMP(3),
    "watchError" TEXT,
    "signal" TEXT,
    "signalAt" TIMESTAMP(3),
    "signalSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'interested',
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "term" TEXT,
    "channel" TEXT,
    "refId" TEXT,
    "resume" TEXT,
    "pay" TEXT,
    "nextStep" TEXT NOT NULL DEFAULT '',
    "nextStepAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coopPostingId" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "lastContactedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'study',
    "label" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "pay" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "savedItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySource" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "careerUrl" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySource_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "missed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobState" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "JobState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_ContactToSavedItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactToSavedItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CoopPosting_status_idx" ON "CoopPosting"("status");

-- CreateIndex
CREATE INDEX "CoopPosting_deadline_idx" ON "CoopPosting"("deadline");

-- CreateIndex
CREATE INDEX "CoopPosting_firstSeenAt_idx" ON "CoopPosting"("firstSeenAt");

-- CreateIndex
CREATE INDEX "CoopPosting_urlKey_idx" ON "CoopPosting"("urlKey");

-- CreateIndex
CREATE INDEX "CoopPosting_titleKey_idx" ON "CoopPosting"("titleKey");

-- CreateIndex
CREATE INDEX "CoopPosting_duplicateOfId_idx" ON "CoopPosting"("duplicateOfId");

-- CreateIndex
CREATE INDEX "CoopPosting_region_idx" ON "CoopPosting"("region");

-- CreateIndex
CREATE UNIQUE INDEX "CoopPosting_sourceKey_externalKey_key" ON "CoopPosting"("sourceKey", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_kind_applicationStatus_idx" ON "Organization"("kind", "applicationStatus");

-- CreateIndex
CREATE INDEX "Organization_deadline_idx" ON "Organization"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_coopPostingId_key" ON "SavedItem"("coopPostingId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_organizationId_key" ON "SavedItem"("organizationId");

-- CreateIndex
CREATE INDEX "SavedItem_status_idx" ON "SavedItem"("status");

-- CreateIndex
CREATE INDEX "SavedItem_nextStepAt_idx" ON "SavedItem"("nextStepAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_savedItemId_at_idx" ON "ApplicationEvent"("savedItemId", "at");

-- CreateIndex
CREATE INDEX "ApplicationEvent_at_idx" ON "ApplicationEvent"("at");

-- CreateIndex
CREATE INDEX "Contact_followUpAt_idx" ON "Contact"("followUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Term_code_key" ON "Term"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Term_savedItemId_key" ON "Term"("savedItemId");

-- CreateIndex
CREATE INDEX "SourceRun_sourceKey_startedAt_idx" ON "SourceRun"("sourceKey", "startedAt");

-- CreateIndex
CREATE INDEX "_ContactToSavedItem_B_index" ON "_ContactToSavedItem"("B");

-- AddForeignKey
ALTER TABLE "CoopPosting" ADD CONSTRAINT "CoopPosting_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "CoopPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopPosting" ADD CONSTRAINT "CoopPosting_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "CompanySource"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_coopPostingId_fkey" FOREIGN KEY ("coopPostingId") REFERENCES "CoopPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "SavedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "SavedItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRun" ADD CONSTRAINT "SourceRun_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "CompanySource"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToSavedItem" ADD CONSTRAINT "_ContactToSavedItem_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToSavedItem" ADD CONSTRAINT "_ContactToSavedItem_B_fkey" FOREIGN KEY ("B") REFERENCES "SavedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
