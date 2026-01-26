const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';
const API_URL = 'https://nextslide-backend.onrender.com/api/v1/decks';

const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  },
  body: JSON.stringify({
    topic: "Quick test presentation",
    slides: 3
  })
});

const data = await response.json();
console.log('Full response:');
console.log(JSON.stringify(data, null, 2));
console.log('\nKeys:', Object.keys(data));
