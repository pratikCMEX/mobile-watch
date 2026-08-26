import dotenv from "dotenv";
dotenv.config();
const MONGO_USERNAME = process.env.DB_USER || "";
const MONGO_PASSWORD = process.env.DB_PASSWORD || "";

const MONGO_URL = `mongodb://localshot/digitaInterpreter`;

const SERVER_PORT = process.env.PORT ? Number(process.env.PORT) : 3006;

const TCP_PORT = process.env.TCP_PORT ? Number(process.env.TCP_PORT) : 9090;

export const config = {
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
