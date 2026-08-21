-- AlterTable
ALTER TABLE "WardrobeItem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "formality" INTEGER,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "pattern" TEXT,
ADD COLUMN     "seasons" TEXT[],
ADD COLUMN     "styleTags" TEXT[];

