/**
 * Line Item tools — get items for a deal, get single item
 */

import { getObject, getAssociations, batchRead } from "../hubspot/client.js";
import { UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Default properties ───────────────────────────────────────────────

const LINE_ITEM_PROPS = [
  "hs_object_id", "name", "quantity", "price", "amount",
  "hs_product_id", "hs_sku", "description",
  "hs_line_item_currency_code", "createdate",
  "default_dose", "default_frequency", "default_duration",
  "default_quantity", "default_instructions",
  "scriptpad_recipe_id",
];

// ── Tool definitions ─────────────────────────────────────────────────

export const lineItemTools: ToolDef[] = [
  {
    name: "get_line_items_for_deal",
    description:
      "Get all line items (products) associated with a deal. Returns product name, quantity, price, and medication defaults for each item.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        deal_id: {
          type: "string",
          description: "The HubSpot deal ID to get line items for",
        },
      },
      required: ["deal_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { deal_id } = input as { deal_id: string };

      // Get associated line item IDs
      const assocRes = await getAssociations("deals", deal_id, "line_items");
      const lineItemIds = assocRes.results.flatMap((r) =>
        r.to.map((t) => t.toObjectId),
      );

      if (lineItemIds.length === 0) {
        return { total: 0, lineItems: [], note: "No line items found for this deal." };
      }

      // Batch read line items
      const lineItems = await batchRead("line_items", lineItemIds, LINE_ITEM_PROPS);

      const formatted = lineItems.map((li) => ({
        id: li.id,
        name: li.properties.name,
        quantity: li.properties.quantity,
        price: li.properties.price,
        amount: li.properties.amount,
        productId: li.properties.hs_product_id,
        sku: li.properties.hs_sku,
        dose: li.properties.default_dose,
        frequency: li.properties.default_frequency,
        scriptpadRecipeId: li.properties.scriptpad_recipe_id,
      }));

      return { total: formatted.length, lineItems: formatted };
    },
  },

  {
    name: "get_line_item",
    description:
      "Get full details for a single line item by its HubSpot ID. Returns product info, pricing, and medication defaults.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        line_item_id: {
          type: "string",
          description: "The HubSpot line item ID",
        },
      },
      required: ["line_item_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { line_item_id } = input as { line_item_id: string };
      const li = await getObject("line_items", line_item_id, LINE_ITEM_PROPS);
      return {
        id: li.id,
        properties: li.properties,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/0-8/${li.id}`,
      };
    },
  },
];
