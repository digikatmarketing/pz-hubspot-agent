/**
 * Prescription workflow tools — create, cancel, link prescriptions.
 * These are WRITE operations that require user confirmation.
 */

import {
  createObject,
  updateObject,
  createAssociation,
  getObject,
  getAssociations,
  batchRead,
} from "../hubspot/client.js";
import {
  PRESCRIPTIONS_OBJECT_TYPE,
  ASSOC,
  UI_DOMAIN,
  HUB_ID,
} from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Tool definitions ─────────────────────────────────────────────────

export const prescriptionWorkflowTools: ToolDef[] = [
  {
    name: "create_prescription",
    description:
      "Create a new prescription record in HubSpot. WRITE operation — requires confirmation. You must provide at least a medication_name. Optionally link to a contact and/or deal by providing their IDs.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        medication_name: {
          type: "string",
          description: "Name of the medication being prescribed",
        },
        prescription_name: {
          type: "string",
          description: "Display name for the prescription (defaults to medication_name if not provided)",
        },
        dose: {
          type: "string",
          description: "Dosage (e.g. '200mg', '1ml')",
        },
        frequency: {
          type: "string",
          description: "How often to take (e.g. 'Once weekly', 'Twice daily')",
        },
        duration: {
          type: "string",
          description: "Duration of the prescription (e.g. '3 months', '6 months')",
        },
        quantity: {
          type: "string",
          description: "Quantity to dispense",
        },
        instructions: {
          type: "string",
          description: "Patient instructions / directions for use",
        },
        prescription_status: {
          type: "string",
          description: "Status (e.g. 'active', 'pending', 'draft'). Defaults to 'active'",
        },
        contact_id: {
          type: "string",
          description: "HubSpot contact ID to link this prescription to",
        },
        deal_id: {
          type: "string",
          description: "HubSpot deal ID to link this prescription to",
        },
      },
      required: ["medication_name"],
    },
    execute: async (input: Record<string, unknown>) => {
      const {
        medication_name,
        prescription_name,
        dose,
        frequency,
        duration,
        quantity,
        instructions,
        prescription_status = "active",
        contact_id,
        deal_id,
      } = input as Record<string, string | undefined>;

      // Build properties
      const properties: Record<string, string> = {
        medication_name: medication_name!,
        prescription_name: prescription_name ?? medication_name!,
        prescription_status: prescription_status ?? "active",
      };
      if (dose) properties.dose = dose;
      if (frequency) properties.frequency = frequency;
      if (duration) properties.duration = duration;
      if (quantity) properties.quantity = quantity;
      if (instructions) properties.instructions = instructions;

      // Create the prescription
      const rx = await createObject(PRESCRIPTIONS_OBJECT_TYPE, properties);

      // Link to contact if provided
      const associations: string[] = [];
      if (contact_id) {
        await createAssociation(
          PRESCRIPTIONS_OBJECT_TYPE, rx.id,
          "contacts", contact_id,
          ASSOC.RX_TO_CONTACT.category,
          ASSOC.RX_TO_CONTACT.typeId,
        );
        associations.push(`Linked to contact ${contact_id}`);
      }

      // Link to deal if provided
      if (deal_id) {
        await createAssociation(
          PRESCRIPTIONS_OBJECT_TYPE, rx.id,
          "deals", deal_id,
          ASSOC.RX_TO_DEAL.category,
          ASSOC.RX_TO_DEAL.typeId,
        );
        associations.push(`Linked to deal ${deal_id}`);
      }

      return {
        success: true,
        id: rx.id,
        medication: medication_name,
        status: prescription_status,
        associations,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${rx.id}`,
      };
    },
  },

  {
    name: "cancel_prescription",
    description:
      "Cancel a prescription by setting its status to 'cancelled'. WRITE operation — requires confirmation. Provide the prescription ID.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        prescription_id: {
          type: "string",
          description: "The HubSpot prescription object ID to cancel",
        },
        cancellation_reason: {
          type: "string",
          description: "Reason for cancellation (optional)",
        },
      },
      required: ["prescription_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { prescription_id, cancellation_reason } = input as {
        prescription_id: string;
        cancellation_reason?: string;
      };

      // Fetch current state first
      const current = await getObject(
        PRESCRIPTIONS_OBJECT_TYPE,
        prescription_id,
        ["prescription_name", "medication_name", "prescription_status"],
      );

      if (current.properties.prescription_status === "cancelled") {
        return {
          success: false,
          error: "Prescription is already cancelled",
          id: prescription_id,
        };
      }

      const updateProps: Record<string, string> = {
        prescription_status: "cancelled",
      };
      if (cancellation_reason) {
        updateProps.cancellation_reason = cancellation_reason;
      }

      await updateObject(PRESCRIPTIONS_OBJECT_TYPE, prescription_id, updateProps);

      return {
        success: true,
        id: prescription_id,
        name: current.properties.prescription_name ?? current.properties.medication_name,
        previousStatus: current.properties.prescription_status,
        newStatus: "cancelled",
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${prescription_id}`,
      };
    },
  },

  {
    name: "link_prescription",
    description:
      "Link an existing prescription to a contact, deal, or line item. WRITE operation — requires confirmation. Use this when a prescription exists but needs to be associated with another record.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        prescription_id: {
          type: "string",
          description: "The prescription ID to link from",
        },
        contact_id: {
          type: "string",
          description: "Contact ID to link to (optional)",
        },
        deal_id: {
          type: "string",
          description: "Deal ID to link to (optional)",
        },
        line_item_id: {
          type: "string",
          description: "Line item ID to link to (optional)",
        },
      },
      required: ["prescription_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { prescription_id, contact_id, deal_id, line_item_id } = input as {
        prescription_id: string;
        contact_id?: string;
        deal_id?: string;
        line_item_id?: string;
      };

      if (!contact_id && !deal_id && !line_item_id) {
        return { error: "Provide at least one of: contact_id, deal_id, line_item_id" };
      }

      const linked: string[] = [];

      if (contact_id) {
        await createAssociation(
          PRESCRIPTIONS_OBJECT_TYPE, prescription_id,
          "contacts", contact_id,
          ASSOC.RX_TO_CONTACT.category,
          ASSOC.RX_TO_CONTACT.typeId,
        );
        linked.push(`contact ${contact_id}`);
      }

      if (deal_id) {
        await createAssociation(
          PRESCRIPTIONS_OBJECT_TYPE, prescription_id,
          "deals", deal_id,
          ASSOC.RX_TO_DEAL.category,
          ASSOC.RX_TO_DEAL.typeId,
        );
        linked.push(`deal ${deal_id}`);
      }

      if (line_item_id) {
        await createAssociation(
          PRESCRIPTIONS_OBJECT_TYPE, prescription_id,
          "line_items", line_item_id,
          ASSOC.RX_TO_LINE_ITEM.category,
          ASSOC.RX_TO_LINE_ITEM.typeId,
        );
        linked.push(`line item ${line_item_id}`);
      }

      return {
        success: true,
        prescriptionId: prescription_id,
        linked,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${prescription_id}`,
      };
    },
  },

  {
    name: "get_prescriptions_for_contact",
    description:
      "Get all prescriptions for a specific contact. Returns prescription details including medication, status, and dosage information.",
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

      // Get prescription associations
      const assocRes = await getAssociations(
        "contacts", contact_id,
        PRESCRIPTIONS_OBJECT_TYPE,
      );

      const rxIds = assocRes.results.flatMap((r) => r.to.map((t) => t.toObjectId));

      if (rxIds.length === 0) {
        return { total: 0, prescriptions: [] };
      }

      // Batch read prescription details
      const rxRecords = await batchRead(PRESCRIPTIONS_OBJECT_TYPE, rxIds, [
        "prescription_name", "prescription_status",
        "medication_name", "dose", "frequency", "duration", "quantity",
        "instructions", "createdate",
        "scriptpad_recipe_id", "scriptpad_status",
      ]);

      const prescriptions = rxRecords.map((rx) => ({
        id: rx.id,
        name: rx.properties.prescription_name ?? rx.properties.medication_name ?? "(unnamed)",
        status: rx.properties.prescription_status,
        medication: rx.properties.medication_name,
        dose: rx.properties.dose,
        frequency: rx.properties.frequency,
        quantity: rx.properties.quantity,
        created: rx.properties.createdate,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${rx.id}`,
      }));

      return { total: prescriptions.length, prescriptions };
    },
  },
];
