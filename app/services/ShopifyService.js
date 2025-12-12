
export const ShopifyService = {
  /**
   * Fetch Product Data (Price, CompareAtPrice, Collections)
   */
  async getProductData(shopDomain, accessToken, productId) {
    const query = `
          query getProduct($id: ID!) {
            product(id: $id) {
              title
              priceRangeV2 {
                minVariantPrice {
                  amount
                }
              }
              collections(first: 10) {
                nodes {
                  id
                }
              }
    
              variants(first: 1) {
                nodes {
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

      const variant = json.data?.product?.variants?.nodes?.[0];
      const collections = json.data?.product?.collections?.nodes?.map(n => n.id) || [];

      if (variant) {
        return {
          title: json.data?.product?.title,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          collections
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
  }
};
