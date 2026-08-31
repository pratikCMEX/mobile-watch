import express from "express";
import { checkToken } from "../config/jwt";
import Home_controller from "../controllers/user/Home_controller";

const router = express.Router();

router.get("/home", Home_controller.getHome);

module.exports = router;
