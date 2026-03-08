/**
 * Contact tools — search, get, update
 */

import { searchObjects, getObject, updateObject } from "../hubspot/client.js";
import { UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Default properties to return ─────────────────────────────────────

const CONTACT_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone",
  "hs_object_id", "createdate", "lastmodifieddate",
  "lifecyclestage", "hs_lead_status",
  "date_of_birth", "gender", "address", "city", "state", "zip", "country",
  "pz_patient_id", "pz_legacy_id",
  "med_current_medications", "med_allergies", "med_medical_conditions",
];

// ── Tool definitions ─────────────────────────────────────────────────

export const contactTools: ToolDef[] = [
  {
    name: "search_contacts",
    description:
      "Search for contacts by name, email, or phone. Returns up to 10 matches with key properties. Use this when a team member asks about a patient/contact.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free-text search across name, email, phone, company",
        },
        email: {
          type: "string",
          description: "Exact email address to search for",
        },
        phone: {
          type: "string",
          description: "Phone number to search for",
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const { query, email, phone } = input as {
        query?: string;
        email?: string;
        phone?: string;
      };

      // Build filters
      const filters: Array<{ propertyName: string; operator: string; value: string }> = [];
      if (email) filters.push({ propertyName: "email", operator: "EQ", value: email });
      if (phone) filters.push({ propertyName: "phone", operator: "EQ", value: phone });

      const res = await searchObjects("contacts", {
        ...(filters.length > 0
          ? { filterGroups: [{ filters: filters as any }] }
          : {}),
        ...(query && filters.length === 0 ? { query } : {}),
        properties: CONTACT_PROPS,
        limit: 10,
      });

      const contacts = res.results.map((c) => ({
        id: c.id,
        name: `${c.properties.firstname ?? ""} ${c.properties.lastname ?? ""}`.trim() || "(no name)",
        email: c.properties.email,
        phone: c.properties.phone ?? c.properties.mobilephone,
        lifecycleStage: c.properties.lifecyclestage,
        created: c.properties.createdate,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${c.id}`,
      }));

      return {
        total: res.total,
        showing: contacts.length,
        contacts,
      };
    },
  },

  {
    name: "get_contact",
    description:
      "Get full details for a single contact by their HubSpot ID. Returns all standard and custom properties including medical info.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: {
          type: "string",
          description: "The HubSpot contact ID",
        },
      },
      required: ["contact_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { contact_id } = input as { contact_id: string };
      const contact = await getObject("contacts", contact_id, CONTACT_PROPS);
      return {
        id: contact.id,
        properties: contact.properties,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${contact.id}`,
      };
    },
  },

  {
    name: "update_contact",
    description:
      "Update properties on a contact. WRITE operation — requires confirmation. Provide the contact ID and a map of property names to new values.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: {
          type: "string",
          description: "The HubSpot contact ID to update",
        },
        properties: {
          type: "object",
          description:
            'Key-value map of properties to update, e.g. {"phone": "0412345678", "city": "Sydney"}',
          additionalProperties: { type: "string" },
        },
      },
      required: ["contact_id", "properties"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { contact_id, properties } = input as {
        contact_id: string;
        properties: Record<string, string>;
      };
      const updated = await updateObject("contacts", contact_id, properties);
      return {
        success: true,
        id: updated.id,
        updatedProperties: Object.keys(properties),
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${updated.id}`,
      };
    },
  },
];
