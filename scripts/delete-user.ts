import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "../app/lib/firebase-admin";

const emailToDelete = "terangi3@gmail.com";

async function deleteUser() {
  try {
    const admin = getAdminApp();
    const auth = getAuth(admin);

    // Find user by email
    const userRecord = await auth.getUserByEmail(emailToDelete);
    console.log(`Found user: ${userRecord.uid} (${userRecord.email})`);

    // Delete user
    await auth.deleteUser(userRecord.uid);
    console.log(`Successfully deleted user: ${emailToDelete}`);
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      console.log(`User ${emailToDelete} not found`);
    } else {
      console.error("Error deleting user:", error);
    }
  }
}

deleteUser();
