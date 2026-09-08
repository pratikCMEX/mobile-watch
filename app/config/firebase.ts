import * as admin from "firebase-admin";
import path from "path";

const serviceAccount = require(path.join(
  __dirname,
  "../../firebase_credentials.json"
));

if (!admin.getApps().length) {
  admin.initializeApp({
    credential: admin.cert(serviceAccount),
  });
}

export default admin;
