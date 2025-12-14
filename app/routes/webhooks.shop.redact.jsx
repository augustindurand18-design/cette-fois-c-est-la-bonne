import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    console.log('Payload:', payload);

    // Implement your shop redaction logic here.
    // This occurs 48 hours after an app is uninstalled.
    // You must delete all shop data.

    return new Response();
};
