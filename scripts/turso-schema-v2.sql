-- Schema extendido para LaserCraft AI - sistema de aprendizaje

CREATE TABLE IF NOT EXISTS "LearningEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userMessage" TEXT NOT NULL,
    "templateId" TEXT,
    "params" TEXT,
    "success" BOOLEAN NOT NULL,
    "validSvg" BOOLEAN NOT NULL,
    "loopAttempts" INTEGER NOT NULL,
    "errors" TEXT,
    "replyText" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "DynamicTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceQuery" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "testedWith" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ResearchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "sourcesFound" INTEGER NOT NULL,
    "sourcesUsed" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "templateCreated" BOOLEAN NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "LearningEntry_success_idx" ON "LearningEntry"("success");
CREATE INDEX IF NOT EXISTS "LearningEntry_templateId_idx" ON "LearningEntry"("templateId");
CREATE INDEX IF NOT EXISTS "LearningEntry_createdAt_idx" ON "LearningEntry"("createdAt");
CREATE INDEX IF NOT EXISTS "UserPreference_key_idx" ON "UserPreference"("key");
CREATE INDEX IF NOT EXISTS "DynamicTemplate_verified_idx" ON "DynamicTemplate"("verified");
CREATE INDEX IF NOT EXISTS "DynamicTemplate_name_idx" ON "DynamicTemplate"("name");
CREATE INDEX IF NOT EXISTS "ResearchLog_query_idx" ON "ResearchLog"("query");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key_idx" ON "UserPreference"("userId", "key");
