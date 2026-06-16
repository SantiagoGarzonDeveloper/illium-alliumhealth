import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync('/Users/santiago/Desktop/Laboral/Sitios Web/Clientes/El rey Automatizacion/monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
await db.doc('settings/general').set({ publicSiteUrl: 'https://alliumhealth.net' }, { merge: true });
const snap = await db.doc('settings/general').get();
console.log('publicSiteUrl =', snap.data()?.publicSiteUrl);
process.exit(0);
