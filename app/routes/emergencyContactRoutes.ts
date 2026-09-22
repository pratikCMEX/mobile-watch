import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import {
  createOrUpdateEmergencyContact,
  saveEmergencyContacts,
  deleteEmergencyContact,
  allEmergencyContact,
  getEmergencyContact,
  setPhonebook,
  deletePhonebookContact,
  listPhonebook,
} from "../controllers/user/Emergency_contact";

const router = express.Router();

router.post(
  "/set_phonebook",
  checkToken,
  ValidateJoi(Schemas.phonebook.set),
  setPhonebook
);

router.post(
  "/list_phonebook",
  checkToken,
  ValidateJoi(Schemas.phonebook.list),
  listPhonebook
);

router.post(
  "/delete_phonebook",
  checkToken,
  ValidateJoi(Schemas.phonebook.delete),
  deletePhonebookContact
);

router.post("/save_contacts", checkToken, saveEmergencyContacts);

router.post("/save_contact", checkToken, createOrUpdateEmergencyContact);

router.delete("/delete/:id", checkToken, deleteEmergencyContact);

router.post("/all", checkToken, allEmergencyContact);

router.get("/:id", checkToken, getEmergencyContact);

module.exports = router;
