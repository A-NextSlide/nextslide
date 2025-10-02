#!/usr/bin/env node

/**
 * Test script to verify frontend authentication flow
 * Run this script after signing in to check token storage
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Frontend Authentication Test Script');
console.log('===================================\n');

console.log('This script will guide you through testing the authentication flow.\n');

console.log('1. First, open your browser console (F12) and go to the Application tab');
console.log('2. Navigate to Local Storage > http://localhost:8080');
console.log('3. Look for the following keys:');
console.log('   - access_token');
console.log('   - refresh_token');
console.log('   - nextslide_user\n');

rl.question('Do you see these keys in local storage? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log('\n✅ Good! Tokens are being stored properly.\n');
    
    console.log('Now check if the tokens are being sent with API requests:');
    console.log('1. Go to the Network tab in browser dev tools');
    console.log('2. Clear the network log');
    console.log('3. Navigate to the decks page or refresh it');
    console.log('4. Look for requests to /auth/decks');
    console.log('5. Click on the request and check the Request Headers');
    console.log('6. Look for the Authorization header\n');
    
    rl.question('Do you see an Authorization header with "Bearer <token>"? (yes/no): ', (answer2) => {
      if (answer2.toLowerCase() === 'yes') {
        console.log('\n✅ Excellent! Authentication is working properly.');
        console.log('The issue might be with the backend validation.\n');
      } else {
        console.log('\n❌ Issue found: Authorization header is not being sent.');
        console.log('This means the frontend is not properly adding the auth header to requests.\n');
        console.log('Possible causes:');
        console.log('1. The authService.getAuthToken() is returning null');
        console.log('2. The API utility functions are not being used consistently');
        console.log('3. Some API calls are bypassing the auth header logic\n');
      }
      rl.close();
    });
  } else {
    console.log('\n❌ Issue found: Tokens are not being stored in local storage.');
    console.log('This means the sign-in process is not completing successfully.\n');
    console.log('Possible causes:');
    console.log('1. The backend is not returning tokens');
    console.log('2. The frontend is not storing the tokens after sign in');
    console.log('3. There\'s an error in the sign-in response handling\n');
    
    console.log('To debug further:');
    console.log('1. Check the Network tab for the sign-in request (/auth/signin)');
    console.log('2. Look at the response - it should contain access_token and refresh_token');
    console.log('3. Check the Console for any JavaScript errors\n');
    
    rl.close();
  }
});

rl.on('close', () => {
  console.log('\nTest script completed. Check the findings above to fix the issue.');
  process.exit(0);
});