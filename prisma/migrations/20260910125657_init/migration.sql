-- CreateTable
CREATE TABLE "CoopPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "location" TEXT,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "sourceKey" TEXT,
    "externalKey" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME,
    "missCount" INTEGER NOT NULL DEFAULT 0,
    "disappearedAt" DATETIME,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoopPosting_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "CompanySource" ("key") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "applicationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "deadline" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastCheckedAt" DATETIME,
    "managed" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'interested',
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "coopPostingId" TEXT,
    "organizationId" TEXT,
    CONSTRAINT "SavedItem_coopPostingId_fkey" FOREIGN KEY ("coopPostingId") REFERENCES "CoopPosting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanySource" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "careerUrl" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastOkAt" DATETIME,
    "lastError" TEXT,
    "lastFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "missed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "SourceRun_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "CompanySource" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME,
    "lastOkAt" DATETIME,
    "lastError" TEXT
);

-- CreateIndex
CREATE INDEX "CoopPosting_status_idx" ON "CoopPosting"("status");

-- CreateIndex
CREATE INDEX "CoopPosting_deadline_idx" ON "CoopPosting"("deadline");

-- CreateIndex
CREATE INDEX "CoopPosting_firstSeenAt_idx" ON "CoopPosting"("firstSeenAt");

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
CREATE INDEX "SourceRun_sourceKey_startedAt_idx" ON "SourceRun"("sourceKey", "startedAt");
