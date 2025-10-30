# 🚀 Quick Test Guide for Authentication Fixes

## Immediate Testing (5 minutes)

### Step 1: Start Development Servers

```bash
# Terminal 1 - Frontend
cd apps/frontend
npm run dev

# Terminal 2 - Backend  
cd apps/backend
python -m uvicorn api.chat_server:app --reload --port 9090
```

Wait for both servers to start successfully.

---

### Step 2: Open Browser and DevTools

1. Open your browser
2. Go to: `http://localhost:8080` (or whatever port your frontend is on)
3. Press **F12** to open DevTools
4. Click on the **Console** tab

---

### Step 3: Test Authentication with Logging

#### A. Test Normal Login (Email/Password)

1. Navigate to the login page
2. Enter your email and password
3. **Watch the console** - you should see:
   ```
   [Auth] Attempting sign-in with email: your@email.com
   ```

4. Click "Sign In"

**If successful:**
```
[Auth] Sign-in successful for user: abc-123-def...
[AuthCallback] Authentication successful!
```

**If there's an error:**
- You'll see a specific, helpful error message
- Check the console for detailed logs
- The error will tell you exactly what's wrong

#### B. Test Google Login

1. Click "Sign in with Google" button

2. **Watch the console** - you should see:
   ```
   [Auth] Initiating Google OAuth sign-in...
   [Auth] Redirect URL: http://localhost:8080/auth-callback
   [Auth] OAuth initiated successfully, redirecting to Google...
   ```

3. You'll be redirected to Google's consent screen

4. After granting permission, you'll be redirected back

5. **Watch the console again:**
   ```
   [AuthCallback] Starting authentication callback handling...
   [AuthCallback] Full URL: http://localhost:8080/auth-callback?code=...
   [AuthCallback] Attempting PKCE code exchange...
   ```

**If successful:**
```
[AuthCallback] Code exchange successful
[AuthCallback] Authentication successful! { userId: '...', email: '...' }
```

**If there's an error:**
- The console will show exactly where it failed
- You'll see a user-friendly error message
- Follow the suggested action in the error

---

### Step 4: Run Diagnostics (if needed)

If authentication fails:

1. In the browser console, type and run:
   ```javascript
   window.runAuthDiagnostics()
   ```

2. Review the diagnostic report

3. Look for any **❌ Failed** items

4. Fix those issues following the recommendations

---

## 🔍 What to Look For

### ✅ Success Indicators:

- No errors in console
- Logs show clear progression: `Initiating → Callback → Exchange → Successful`
- Redirected to `/app` after login
- Toast notification appears: "Welcome!"

### ❌ Failure Indicators:

- Console shows errors
- Stuck on login page
- Error toast appears
- No redirect happens

---

## 🛠️ Common Issues & Quick Fixes

### Issue: "Failed to complete authentication..."

**Quick Check:**
```javascript
// In console
window.runAuthDiagnostics()
```

Look for failed environment variable checks.

**Quick Fix:**
1. Check if `.env` file exists in `apps/frontend/`
2. Ensure it has:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

---

### Issue: "You cancelled the authentication process"

This means you clicked "Cancel" or closed the Google consent screen.

**Quick Fix:**
- Just try again and complete the Google sign-in flow

---

### Issue: "The authentication link has expired..."

This usually happens with magic links, not Google OAuth.

**Quick Fix:**
- Make sure you're clicking the **Google sign-in button**, not a magic link
- Clear your browser cache and try again

---

### Issue: Console shows "Unable to exchange external code"

This is the original error! It means Supabase configuration is needed.

**Quick Fix:**
1. Open `SUPABASE_AUTH_FIX.md`
2. Follow **Section 1: Configure Redirect URLs**
3. Follow **Section 2: Configure Google OAuth Provider**
4. Restart your servers
5. Try again

---

## 📋 5-Minute Checklist

- [ ] Both servers running (frontend & backend)
- [ ] Browser DevTools Console open
- [ ] Clicked "Sign in with Google"
- [ ] Checked console for `[Auth]` logs
- [ ] If error: Ran `window.runAuthDiagnostics()`
- [ ] If needed: Followed `SUPABASE_AUTH_FIX.md`

---

## 🎯 Expected Timeline

| Step | Time | What You're Doing |
|------|------|-------------------|
| 1 | 1 min | Start servers |
| 2 | 30 sec | Open browser & DevTools |
| 3 | 2 min | Test authentication |
| 4 | 1 min | Review logs |
| 5 | 30 sec | Run diagnostics (if needed) |

**Total: ~5 minutes**

---

## 💡 Pro Tips

1. **Keep DevTools Console open** while testing
   - All authentication steps are logged
   - Errors show exactly where things fail

2. **Try incognito mode** if you're having cache issues
   - Ctrl+Shift+N (Windows) or Cmd+Shift+N (Mac)
   - This tests with a clean state

3. **Check both authentication methods**
   - Normal login (email/password)
   - Google OAuth
   - Both should work smoothly

4. **Use the diagnostics tool**
   - It's your friend for configuration issues
   - Runs automatically in development
   - Just type `window.runAuthDiagnostics()`

---

## 🎓 Understanding the Logs

### Normal Sign-In Success:
```
[Auth] Attempting sign-in with email: user@example.com
[Auth] Sign-in successful for user: abc-123...
```

### Google OAuth Success:
```
[Auth] Initiating Google OAuth sign-in...
[Auth] Redirect URL: http://localhost:8080/auth-callback
[Auth] OAuth initiated successfully, redirecting to Google...
[AuthCallback] Starting authentication callback handling...
[AuthCallback] PKCE code exchange...
[AuthCallback] Code exchange successful
[AuthCallback] Authentication successful!
```

### Error Example:
```
[AuthCallback] Error in URL: { error: 'access_denied', ... }
Authentication failed
You cancelled the authentication process. Please try again.
```

---

## 🆘 Need Help?

If tests fail:

1. **Copy the console logs**
   - Right-click in console → Save as...
   - Or copy/paste the logs

2. **Run and copy diagnostics**
   ```javascript
   window.runAuthDiagnostics()
   ```

3. **Note which method fails**
   - Google OAuth?
   - Normal login?
   - Both?

4. **Check configuration**
   - Follow `SUPABASE_AUTH_FIX.md` step by step
   - Most issues are Supabase configuration

---

## ✨ After Successful Test

Once everything works:

1. ✅ Mark the issue as resolved
2. ✅ Test in production (after deploying)
3. ✅ Update production redirect URLs in Supabase
4. ✅ Celebrate! 🎉

---

**Quick Links:**
- Detailed Config: `SUPABASE_AUTH_FIX.md`
- Summary of Fixes: `AUTH_FIX_SUMMARY.md`
- This Guide: `QUICK_TEST_GUIDE.md`

---

Happy Testing! 🚀

