"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Joi_1 = require("../middleware/Joi");
const Healthmetrics_controller_1 = __importDefault(require("../controllers/user/Healthmetrics_controller"));
const router = express_1.default.Router();
router.post("/add_metrics", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.healthMetric.add), Healthmetrics_controller_1.default.AddMetrics);
router.post("/get_analytics", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.healthMetric.analytics), Healthmetrics_controller_1.default.getAnalytics);
module.exports = router;
