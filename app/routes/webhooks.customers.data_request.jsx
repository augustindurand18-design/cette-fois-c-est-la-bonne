import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    console.log('Payload:', payload);

    // Implement your data request logic here.
    // You must send the customer data within 30 days.

    return new Response();
};
