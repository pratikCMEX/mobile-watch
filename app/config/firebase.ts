const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");
import path from "path";
import Logging from "../library/Logging";

// firebase-admin v14 is ESM-only; require() may return a CJS wrapper.
// Detect the real admin namespace by checking for known methods.
const firebase = (
  admin.default && typeof admin.default.initializeApp === "function"
    ? admin.default
    : admin
) as any;

const serviceAccount = require(path.join(
  __dirname,
  "../../firebase_credentials.json"
));

if (!firebase.getApps().length) {
  firebase.initializeApp({
    credential: firebase.cert(serviceAccount),
  });
  Logging.info("Firebase Admin SDK initialized successfully");
}

/**
 * firebase-admin v14 moved `messaging()` off the main namespace into the
 * `firebase-admin/messaging` sub-module.  This wrapper keeps the rest of the
 * codebase calling `messaging()` as before while using the correct v14 API.
 */
const messaging = () => getMessaging();

export { getMessaging, messaging };
export default firebase;
