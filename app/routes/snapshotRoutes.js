"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Joi_1 = require("../middleware/Joi");
const Snapshot_controller_1 = __importDefault(require("../controllers/user/Snapshot_controller"));
const jwt_1 = require("../config/jwt");
const Multer_1 = require("../middleware/Multer");
const router = express_1.default.Router();
router.post("/add_snapshot", Multer_1.uploadSnapshot.fields([{ name: "image", maxCount: 1 }]), jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.snapshot.add), Snapshot_controller_1.default.AddSnapshot);
router.post("/list_snapshots", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.snapshot.list), Snapshot_controller_1.default.ListSnapshots);
module.exports = router;
