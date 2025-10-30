# Supabase Authentication Configuration Fix

## Issues Found

Your authentication is failing due to **redirect URI mismatch** and **Google OAuth configuration issues**. Here's how to fix them:

---

## 🔧 Quick Fixes Required

### 1. Configure Redirect URLs in Supabase Dashboard

**CRITICAL:** The redirect URL must be **exactly** the same in your code and Supabase dashboard.

#### Steps:
1. Go to your **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Navigate to: **Authentication** → **URL Configuration**
4. Add these URLs to **Redirect URLs** section:

```
http://localhost:8080/auth-callback
http://localhost:3000/auth-callback
https://yourdomain.com/auth-callback
https://auth.nextslide.ai/auth-callback
```

**Replace `yourdomain.com` with your actual production domain!**

5. Make sure there are **NO trailing slashes** (e.g., `/auth-callback/` is wrong)
6. Click **Save**

---

### 2. Configure Google OAuth Provider

#### Steps:
1. In Supabase Dashboard, go to: **Authentication** → **Providers**
2. Find **Google** and click **Edit**
3. **Enable** the Google provider
4. Add your **Google Client ID** and **Google Client Secret**
5. **Authorized redirect URI** should be automatically set by Supabase
6. Click **Save**

#### Get Google OAuth Credentials:
If you don't have Google OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Set **Application type**: Web application
6. Add **Authorized redirect URIs**:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   (Get the exact URL from your Supabase Google provider settings)
7. Copy the **Client ID** and **Client Secret**
8. Paste them into Supabase Google provider settings

---

### 3. Configure PKCE Flow Settings

In your Supabase Dashboard:
1. Go to **Authentication** → **Settings**
2. Under **Auth flow type**, ensure **PKCE** is enabled
3. **Save changes**

---

### 4. Environment Variables Check

Make sure your `.env` files have the correct Supabase configuration:

#### Frontend `.env` (apps/frontend/.env):
```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

#### Backend `.env` (apps/backend/.env):
```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

**Get these values from:** Supabase Dashboard → **Settings** → **API**

---

## 🧪 Testing the Fix

After making these changes:

1. **Clear browser cache and cookies** (Important!)
2. **Restart your development servers**:
   ```bash
   # In separate terminals
   cd apps/frontend && npm run dev
   cd apps/backend && python -m uvicorn api.chat_server:app --reload --port 9090
   ```

3. **Test Google Login:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Click "Sign in with Google"
   - Watch the console logs (should show `[Auth] Initiating Google OAuth sign-in...`)
   - After redirecting back, check for any errors in the Console

4. **Test Normal Login:**
   - Try signing in with email/password
   - Check console for `[Auth] Attempting sign-in with email:`
   - Verify you don't get "Invalid login credentials" if credentials are correct

---

## 🔍 Troubleshooting

### Error: "Unable to exchange external code"

**Cause:** Redirect URI mismatch or Google OAuth not configured

**Fix:**
1. Double-check redirect URLs in Supabase match exactly: `http://localhost:8080/auth-callback`
2. Ensure Google OAuth provider is **enabled** in Supabase
3. Verify Google OAuth credentials are correctly set
4. Check that your Google Cloud Console has the Supabase callback URL whitelisted

### Error: "OTP error in link"

**Cause:** Supabase is confusing OAuth with magic link (OTP) flow

**Fix:**
1. Make sure you're clicking the **Google sign-in button**, not magic link
2. Clear browser storage: DevTools → Application → Storage → Clear site data
3. Ensure PKCE is enabled in Supabase settings
4. Try using incognito/private browsing mode

### Error: "Invalid login credentials" for valid credentials

**Cause:** User might not exist or email not confirmed

**Fix:**
1. Check if user exists in Supabase Dashboard → **Authentication** → **Users**
2. If user exists, check if email is confirmed (green checkmark)
3. If not confirmed, click the user → Send confirmation email
4. Try password reset if credentials are forgotten

### Error: "Email not confirmed"

**Cause:** User signed up but didn't verify email

**Fix:**
1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Find the user
3. Click **...** menu → **Send confirmation email**
4. Or manually confirm: Click user → Set "Email Confirmed" to current timestamp

---

## 📋 Checklist

Before considering this fixed, ensure:

- [ ] Redirect URLs added to Supabase (including localhost and production)
- [ ] Google OAuth provider enabled and configured in Supabase
- [ ] Google Cloud Console has Supabase callback URL whitelisted
- [ ] Environment variables are correct in both frontend and backend
- [ ] PKCE flow is enabled in Supabase
- [ ] Browser cache/cookies cleared
- [ ] Development servers restarted
- [ ] Can successfully sign in with Google
- [ ] Can successfully sign in with email/password
- [ ] Console shows proper logging (no errors)

---

## 🆘 Still Having Issues?

If you're still experiencing problems:

1. **Check Console Logs:**
   - Open browser DevTools → Console
   - Look for `[Auth]` or `[AuthCallback]` logs
   - Copy any error messages

2. **Check Network Tab:**
   - DevTools → Network
   - Filter by "auth"
   - Look for failed requests
   - Check the response for error details

3. **Verify Supabase Status:**
   - Check [Supabase Status Page](https://status.supabase.com)
   - Ensure no ongoing incidents

4. **Contact Info:**
   - Provide the exact error message from console
   - Include the redirect URL you're using
   - Mention whether it fails on localhost or production or both

---

## 📝 Summary of Changes Made

I've updated the following files to improve authentication:

1. **apps/frontend/src/pages/AuthCallback.tsx**
   - Added comprehensive logging
   - Better error handling for OTP/OAuth confusion
   - Support for both PKCE and implicit flow
   - More user-friendly error messages

2. **apps/frontend/src/context/SupabaseAuthContext.tsx**
   - Enhanced Google OAuth with better logging
   - Improved normal login error messages
   - Better error categorization

These changes will help diagnose issues and provide clearer feedback to users.

---

## ✅ Expected Behavior After Fix

**Google Login:**
1. Click "Sign in with Google"
2. Console: `[Auth] Initiating Google OAuth sign-in...`
3. Redirected to Google consent screen
4. After consent, redirected back to `/auth-callback`
5. Console: `[AuthCallback] PKCE code exchange...`
6. Console: `[AuthCallback] Authentication successful!`
7. Redirected to `/app`
8. Toast: "Welcome! You have been successfully signed in."

**Normal Login:**
1. Enter email and password
2. Console: `[Auth] Attempting sign-in with email: user@example.com`
3. Console: `[Auth] Sign-in successful for user: [uuid]`
4. Toast: "Welcome back! Successfully signed in."
5. Redirected to `/app`

---

Last updated: 2025-10-30

