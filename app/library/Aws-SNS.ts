import { env } from "process";

export const awssns = () => {
  const AWS = require("aws-sdk");
  AWS.config.update({
    region: "eu-north-1", // Replace with your AWS region
    accessKeyId: env.ACCESS_KEY_ID,
    secretAccessKey: env.SECRET_ACCESS_KEY,
  });
  const sns = new AWS.SNS();
  return sns;
};
