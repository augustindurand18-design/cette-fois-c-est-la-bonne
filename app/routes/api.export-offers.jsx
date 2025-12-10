
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shopUrl = session.shop;

    const shop = await db.shop.findUnique({
        where: { shopUrl },
    });

    if (!shop) {
        return new Response("Boutique introuvable", { status: 404 });
    }

    const offers = await db.offer.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: 'desc' }
    });

    // French Excel friendly: Semicolon separator + BOM
    const csvRows = [
        ["ID", "Date", "Heure", "Produit", "Prix Original", "Offre Client", "Statut", "Code Promo", "Session ID"]
    ];

    for (const offer of offers) {
        const date = new Date(offer.createdAt);
        csvRows.push([
            offer.id,
            date.toLocaleDateString("fr-FR"),
            date.toLocaleTimeString("fr-FR"),
            `"${(offer.productTitle || "").replace(/"/g, '""')}"`,
            (offer.originalPrice || 0).toString().replace('.', ','), // French decimal comma
            (offer.offeredPrice || 0).toString().replace('.', ','),
            offer.status,
            offer.code || "",
            offer.sessionId || ""
        ]);
    }

    // Add BOM for Excel UTF-8 recognition
    const csvContent = "\uFEFF" + csvRows.map(e => e.join(";")).join("\n");

    return new Response(JSON.stringify({ csv: csvContent }), {
        headers: { "Content-Type": "application/json" }
    });
};
