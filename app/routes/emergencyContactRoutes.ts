import express from "express";
import { checkToken } from "../config/jwt";
import {
  createOrUpdateEmergencyContact,
  saveEmergencyContacts,
  deleteEmergencyContact,
  allEmergencyContact,
  getEmergencyContact,
} from "../controllers/user/Emergency_contact";

const router = express.Router();

// Bulk save: receive a contacts[] array, upsert each (by id or priority),
// then re-sync ALL stored contacts to the device in priority order.
//
// Body shape:
//   {
//     "serial_number": "8800000015",
//     "contacts": [
//       { "id": "",          "name": "Mom",    "phone_number": "9691905903", "priority": 1 },
//       { "id": "<uuid>",    "name": "Dad",    "phone_number": "9510589322", "priority": 2 },
//       { "id": "",          "name": "Sister", "phone_number": "9587374638", "priority": 3 }
//     ]
//   }
router.post("/save_contact", checkToken, saveEmergencyContacts);

// Create or update a SINGLE emergency contact
// (if id provided -> update, else -> create keyed by (device, priority))
// router.post("/save_contact", checkToken, createOrUpdateEmergencyContact);

// Delete a single emergency contact (auto re-syncs the rest to the watch)
router.delete("/delete/:id", checkToken, deleteEmergencyContact);

// Get all emergency contacts (with pagination)
router.post("/all", checkToken, allEmergencyContact);

// Get single emergency contact by ID
router.get("/:id", checkToken, getEmergencyContact);

module.exports = router;
