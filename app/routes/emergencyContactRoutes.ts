import express from "express";
import { checkToken } from "../config/jwt";
import {
  createOrUpdateEmergencyContact,
  deleteEmergencyContact,
  allEmergencyContact,
  getEmergencyContact,
} from "../controllers/user/Emergency_contact";

const router = express.Router();

// Create or update emergency contact (if id provided -> update, else -> create)
router.post("/save_contact", checkToken, createOrUpdateEmergencyContact);

// Delete emergency contact
router.delete("/delete/:id", checkToken, deleteEmergencyContact);

// Get all emergency contacts (with pagination)
router.post("/all", checkToken, allEmergencyContact);

// Get single emergency contact by ID
router.get("/:id", checkToken, getEmergencyContact);

module.exports = router;
