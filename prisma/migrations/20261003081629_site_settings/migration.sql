-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "phone" TEXT,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "address" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- Én række med firmaoplysninger.
ALTER TABLE "SiteSettings" ADD CONSTRAINT "site_settings_single_row" CHECK ("id" = 1);
