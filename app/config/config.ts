import dotenv from "dotenv";
dotenv.config();
//server config
const SERVER_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const TCP_PORT = process.env.TCP_PORT ? Number(process.env.TCP_PORT) : 9000;

export const config = {
    server: {
        port: SERVER_PORT,
    },
    tcp: {
        port: TCP_PORT,
    },
};
