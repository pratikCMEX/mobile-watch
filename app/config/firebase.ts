import admin from "firebase-admin";
import path from "path";

const serviceAccount = require(path.join(
  __dirname,
  "../../firebase_credentials.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
