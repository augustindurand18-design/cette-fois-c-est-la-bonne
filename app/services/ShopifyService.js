
export const ShopifyService = {
  /**
   * Fetch Product Data (Price, CompareAtPrice, Collections)
   */
  async getProductData(shopDomain, accessToken, productId, variantId = null) {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          title
          collections(first: 5) {
            nodes {
              id
            }
          }
          variants(first: 20) {
            nodes {
              id
              compareAtPrice
              price
            }
          }
        }
      }
    `;

    const variables = {
      id: `gid://shopify/Product/${productId}`
    };

    try {
      const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables })
      });

      const json = await response.json();

      if (!response.ok || json.errors) {
        const errorMsg = json.errors ? json.errors.map(e => e.message).join(', ') : "Unknown API Error";
        console.error("ShopifyService: Product Fetch Error", {
          status: response.status,
          errors: json.errors,
        });
        return { error: `Shopify API Error: ${errorMsg}` };
      }

      const variants = json.data?.product?.variants?.nodes || [];
      const collections = json.data?.product?.collections?.nodes?.map(n => n.id) || [];

      // Find specific variant or default to first
      let variant;
      if (variantId) {
        // Handle both numeric ID and GID
        const gid = variantId.includes("gid://") ? variantId : `gid://shopify/ProductVariant/${variantId}`;
        variant = variants.find(v => v.id === gid);
      }

      if (!variant) {
        variant = variants[0];
      }

      if (variant) {
        return {
          title: json.data?.product?.title,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          collections,
          variantId: variant.id
        };
      }

      console.error("ShopifyService: No variant found in response", JSON.stringify(json, null, 2));
      return { error: "Produit ou variante introuvable." };

    } catch (e) {
      console.error("ShopifyService: Error fetching price", e);
      return { error: `Network/Server Error: ${e.message}` };
    }
  },

  /**
   * Create a specific discount code for an accepted offer
   */
  async createDiscount(shopDomain, accessToken, code, amount, productGid, endsAt = null) {
    const query = `
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    codes(first: 1) {
                      nodes {
                        code
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

    const variables = {
      basicCodeDiscount: {
        title: `SmartOffer ${code}`,
        code: code,
        startsAt: new Date().toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: {
          all: true
        },
        customerGets: {
          value: {
            discountAmount: {
              amount: Math.abs(amount).toFixed(2),
              appliesOnEachItem: false
            }
          },
          items: {
            products: {
              productsToAdd: [productGid]
            }
          }
        }
      }
    };

    try {
      const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables })
      });

      const responseJson = await response.json();

      if (responseJson.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
        console.error("ShopifyService: Discount Creation Errors:", JSON.stringify(responseJson.data.discountCodeBasicCreate.userErrors, null, 2));
        return null;
      }

      return code;
    } catch (e) {
      console.error("ShopifyService: Network or parsing error", e);
      return null;
    }
  },

  /**
   * Create a Draft Order (VIP Mode)
   */
  async createDraftOrder(shopDomain, accessToken, variantId, amount, email = null) {
    const query = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        email: email,
        note: "Commande issue d'une négociation (À Valider)",
        tags: ["SmartOffer", "Negotiation_Draft"],
        lineItems: [
          {
            variantId: variantId.includes("gid://") ? variantId : `gid://shopify/ProductVariant/${variantId}`,
            quantity: 1,
            appliedDiscount: {
              value: Math.abs(amount).toFixed(2),
              valueType: "FIXED_AMOUNT",
              title: "Remise Négociée"
            }
          }
        ]
      }
    };

    try {
      const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables })
      });

      const json = await response.json();

      if (json.errors || json.data?.draftOrderCreate?.userErrors?.length > 0) {
        console.error("ShopifyService: Draft Order Creation Error", json.errors || json.data.draftOrderCreate.userErrors);
        return null;
      }

      return json.data?.draftOrderCreate?.draftOrder;
    } catch (e) {
      console.error("ShopifyService: Error creating draft order", e);
      return null;
    }
  },

  /**
   * Create or update a customer in Shopify with 'Negotiator' tag
   */
  async createCustomer(shopDomain, accessToken, email, firstName = "", lastName = "") {
    const query = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        email: email,
        firstName: firstName,
        lastName: lastName,
        tags: ["Negotiator", "SmartOffer"],
        emailMarketingConsent: {
          marketingState: "SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN"
        }
      }
    };

    try {
      const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables })
      });

      const json = await response.json();

      if (json.data?.customerCreate?.userErrors?.length > 0) {
        // If error is "Email has already been taken", it's fine, we should probably update tags then.
        // But for MVP, we just ignore if they exist.
        const errors = json.data.customerCreate.userErrors;
        const emailTaken = errors.some(e => e.message.includes("taken"));

        if (!emailTaken) {
          console.error("ShopifyService: Customer Creation Errors:", JSON.stringify(errors, null, 2));
        }
        return null;
      }

      return json.data?.customerCreate?.customer?.id;
    } catch (e) {
      console.error("ShopifyService: Error creating customer", e);
      return null;
    }
  }
};
