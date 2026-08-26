"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_USERNAME = process.env.DB_USER || "";
const MONGO_PASSWORD = process.env.DB_PASSWORD || "";
const MONGO_URL = `mongodb://localshot/digitaInterpreter`;
const SERVER_PORT = process.env.SERVER_PORT
    ? Number(process.env.SERVER_PORT)
    : 3006;
const TCP_PORT = process.env.TCP_PORT ? Number(process.env.TCP_PORT) : 9090;
exports.config = {
    mongo: {
        url: MONGO_URL,
    },
    server: {
        port: SERVER_PORT,
    },
    tcp: {
        port: TCP_PORT,
    },
};
