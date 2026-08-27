import express from "express";
import Log_controller from "../controllers/admin/Log_controller";
import { checkAdmin } from "../config/jwt";

const router = express.Router();

router.get("/:filename", checkAdmin, Log_controller.getLog);

module.exports = router;
