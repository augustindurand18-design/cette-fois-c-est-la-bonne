-- AlterTable
ALTER TABLE "Rule" ADD COLUMN "minPrice" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "sessionId" TEXT,
    "offeredPrice" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "productTitle" TEXT,
    "productId" TEXT,
    "originalPrice" REAL,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" DATETIME,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterPrice" REAL,
    CONSTRAINT "Offer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Offer" ("code", "createdAt", "customerEmail", "id", "offeredPrice", "shopId", "status") SELECT "code", "createdAt", "customerEmail", "id", "offeredPrice", "shopId", "status" FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
CREATE INDEX "Offer_sessionId_idx" ON "Offer"("sessionId");
CREATE INDEX "Offer_code_idx" ON "Offer"("code");
CREATE INDEX "Offer_shopId_idx" ON "Offer"("shopId");
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopUrl" TEXT NOT NULL,
    "accessToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "autoNegotiation" BOOLEAN NOT NULL DEFAULT true,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "strategy" TEXT NOT NULL DEFAULT 'moderate',
    "allowSaleItems" BOOLEAN NOT NULL DEFAULT true,
    "priceRounding" REAL NOT NULL DEFAULT 0.85,
    "botWelcomeMsg" TEXT NOT NULL DEFAULT 'Bonjour ! 👋 Je peux vous faire une remise si vous me proposez un prix raisonnable. Quel est votre prix ?',
    "botRejectMsg" TEXT NOT NULL DEFAULT 'C''est un peu juste... Je peux vous le faire à {price} €.',
    "botSuccessMsg" TEXT NOT NULL DEFAULT 'C''est d''accord pour {price}€ ! 🎉',
    "widgetColor" TEXT NOT NULL DEFAULT '#000000',
    "widgetTitle" TEXT NOT NULL DEFAULT 'Chat with us',
    "chatTheme" TEXT NOT NULL DEFAULT 'modern',
    "botIcon" TEXT,
    "emailFont" TEXT NOT NULL DEFAULT 'Arial, sans-serif',
    "emailPrimaryColor" TEXT NOT NULL DEFAULT '#008060',
    "emailAcceptedSubject" TEXT NOT NULL DEFAULT 'Your offer has been accepted! 🎉',
    "emailAcceptedBody" TEXT NOT NULL DEFAULT '<h2>Congratulations! Your offer has been accepted.</h2><p>You successfully negotiated for the product: <strong>{productTitle}</strong>.</p><p>Here is your unique discount code:</p><h1 style=''color: {color};''>{code}</h1><p><strong>Attention:</strong> This code is valid only until: {endsAt}.</p>',
    "emailRejectedSubject" TEXT NOT NULL DEFAULT 'Update on your offer',
    "emailRejectedBody" TEXT NOT NULL DEFAULT '<h2>Regarding your offer for {productTitle}</h2><p>We have reviewed your proposal, but unfortunately we cannot accept it at this time.</p><p>Feel free to <a href=''{productUrl}''>visit our shop</a> to make a different offer.</p>',
    "emailCounterSubject" TEXT NOT NULL DEFAULT 'Counter-offer for your request',
    "emailCounterBody" TEXT NOT NULL DEFAULT '<h2>New proposal for {productTitle}</h2><p>Your initial offer was a bit low, but we want to find a deal.</p><p>We can offer you this product for the exceptional price of:</p><h1 style=''color: blue;''>{newPrice} €</h1><p><strong>Accept this offer:</strong> Use code <strong style=''color: green;''>{code}</strong> at checkout.</p><p>(Valid until {endsAt})</p>',
    "enableExitIntent" BOOLEAN NOT NULL DEFAULT false,
    "enableInactivityTrigger" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentMode" TEXT NOT NULL DEFAULT 'DISCOUNT_CODE',
    "widgetTemplate" TEXT NOT NULL DEFAULT 'classic',
    "gmailUser" TEXT,
    "gmailAppPassword" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "autoValidityDuration" INTEGER NOT NULL DEFAULT 24,
    "manualValidityDuration" INTEGER NOT NULL DEFAULT 72,
    "reactionMessages" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "negotiationCount" INTEGER NOT NULL DEFAULT 0,
    "lastResetDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Shop" ("accessToken", "createdAt", "id", "isActive", "shopUrl") SELECT "accessToken", "createdAt", "id", "isActive", "shopUrl" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shopUrl_key" ON "Shop"("shopUrl");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Rule_shopId_productId_idx" ON "Rule"("shopId", "productId");

-- CreateIndex
CREATE INDEX "Rule_shopId_collectionId_idx" ON "Rule"("shopId", "collectionId");
