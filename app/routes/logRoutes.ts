import express from "express";
import Log_controller from "../controllers/admin/Log_controller";

const router = express.Router();

router.get("/:filename", Log_controller.getLog);

module.exports = router;
