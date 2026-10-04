-- AlterTable
ALTER TABLE "CoopPosting" ADD COLUMN     "details" TEXT,
ADD COLUMN     "detailsAt" TIMESTAMP(3),
ADD COLUMN     "detailsError" TEXT,
ADD COLUMN     "detailsStatus" TEXT,
ADD COLUMN     "fitReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fitScore" INTEGER,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "CoopPosting_fitScore_idx" ON "CoopPosting"("fitScore");

