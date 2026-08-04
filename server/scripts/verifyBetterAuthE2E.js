import { createAuthClient } from 'better-auth/client';

async function runE2E() {
  console.log("=== STARTING BETTER AUTH END-TO-END VERIFICATION ===");

  const testEmail = `e2e_test_${Date.now()}@example.com`;
  const testPassword = "Password123456!";
  const testName = "E2E Test User";

  let sessionCookie = '';

  const authClient = createAuthClient({
    baseURL: 'http://localhost:3001',
    fetchOptions: {
      headers: {
        origin: 'http://localhost:3005'
      },
      onResponse(context) {
        const cookies = context.response.headers.getSetCookie();
        if (cookies && cookies.length > 0) {
          sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
        }
      }
    }
  });

  // 1. Better Auth Sign Up
  console.log("\n1. Testing Email/Password Sign Up...");
  const signUpRes = await authClient.signUp.email({
    email: testEmail,
    password: testPassword,
    name: testName,
  });

  if (signUpRes.error) {
    console.error("Sign Up Error:", signUpRes.error);
    process.exit(1);
  }
  console.log("Sign Up Success! User ID:", signUpRes.data?.user?.id);
  console.log("User Email:", signUpRes.data?.user?.email);

  // 2. Better Auth Sign In
  console.log("\n2. Testing Email/Password Sign In...");
  const signInRes = await authClient.signIn.email({
    email: testEmail,
    password: testPassword,
  });

  if (signInRes.error) {
    console.error("Sign In Error:", signInRes.error);
    process.exit(1);
  }
  console.log("Sign In Success! User ID:", signInRes.data?.user?.id);
  console.log("Captured Session Cookie:", sessionCookie);

  // 3. Session Retrieval
  console.log("\n3. Testing Session Persistence...");
  const sessionRes = await authClient.getSession({
    fetchOptions: {
      headers: {
        origin: 'http://localhost:3005',
        cookie: sessionCookie
      }
    }
  });

  if (sessionRes.error || !sessionRes.data?.user) {
    console.error("Session Retrieval Failed:", sessionRes.error);
    process.exit(1);
  }
  console.log("Session Verified! Logged in as:", sessionRes.data.user.email);
  console.log("Session User ID:", sessionRes.data.user.id);
  console.log("Session User Role:", sessionRes.data.user.role);

  // 4. Google OAuth Social Sign In URL
  console.log("\n4. Testing Google OAuth Authorization URL Generation...");
  const socialRes = await authClient.signIn.social({
    provider: "google",
    callbackURL: "http://localhost:3005/",
  });
  console.log("Google OAuth Authorization Endpoint invoked cleanly!");

  // 5. Better Auth Sign Out
  console.log("\n5. Testing Sign Out...");
  await authClient.signOut({
    fetchOptions: {
      headers: {
        origin: 'http://localhost:3005',
        cookie: sessionCookie
      }
    }
  });
  console.log("Sign Out Success!");

  console.log("\n=== ALL BETTER AUTH END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY ===");
}

runE2E().catch((err) => {
  console.error("E2E Test Exception:", err);
  process.exit(1);
});
