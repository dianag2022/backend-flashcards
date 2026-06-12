import '../config/firebase';
import { auth } from '../config/firebase';

const uid = process.argv[2];

if (!uid?.trim()) {
  console.error('Usage: npm run set-admin-role -- <uid>');
  process.exit(1);
}

async function assignAdminRole(targetUid: string): Promise<void> {
  try {
    await auth.getUser(targetUid);
  } catch {
    console.error(`User not found for uid: ${targetUid}`);
    process.exit(1);
  }

  await auth.setCustomUserClaims(targetUid, { role: 'admin' });

  console.log(`Custom claim { role: "admin" } assigned to uid: ${targetUid}`);
  console.log('The user must sign out and sign in again to receive an updated ID token.');
}

assignAdminRole(uid.trim()).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to assign admin role: ${message}`);
  process.exit(1);
});
