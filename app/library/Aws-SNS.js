"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awssns = void 0;
const process_1 = require("process");
const awssns = () => {
    const AWS = require("aws-sdk");
    AWS.config.update({
        region: "eu-north-1", // Replace with your AWS region
        accessKeyId: process_1.env.ACCESS_KEY_ID,
        secretAccessKey: process_1.env.SECRET_ACCESS_KEY,
    });
    const sns = new AWS.SNS();
    return sns;
};
exports.awssns = awssns;
