-- Schema LaserCraft AI para Turso
CREATE TABLE "SavedDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "svg" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "partCount" INTEGER NOT NULL,
    "material" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "messages" TEXT NOT NULL,
    "templateId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SavedDesign_templateId_idx" ON "SavedDesign"("templateId");
CREATE INDEX "SavedDesign_userId_idx" ON "SavedDesign"("userId");
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");
