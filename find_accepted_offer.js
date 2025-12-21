
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findAcceptedOffer() {
    const offer = await prisma.offer.findFirst({
        where: { status: 'ACCEPTED' },
        include: { shop: true }
    });
    console.log(JSON.stringify(offer, null, 2));
}

findAcceptedOffer()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
