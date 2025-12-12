import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
    const shops = await db.shop.findMany();
    console.log(`Found ${shops.length} shops.`);

    for (const shop of shops) {
        console.log(`Updating shop: ${shop.shopUrl}`);
        await db.shop.update({
            where: { id: shop.id },
            data: {
                botWelcomeMsg: "Hello! 👋 I can offer you a discount if you propose a reasonable price. What is your price?",
                botRejectMsg: "Hmm, that's too low. I can go down to {price}€.",
                botSuccessMsg: "It's a deal for {price}€ ! 🎉"
            }
        });
    }
    console.log("Update complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await db.$disconnect();
    });
