"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Sequelize = require("sequelize");
require("dotenv").config();
if (typeof process.env.DB_DIALECT === "undefined") {
    throw new Error("Env is undefined");
}
var sequelize = new Sequelize({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    logging: false,
});
exports.default = sequelize;
