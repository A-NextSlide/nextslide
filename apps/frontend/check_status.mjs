const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';

const decks = [
  '1df8ef5b-8c5b-49e8-84cf-fc6ec00dda67',
  'a5d0297c-778c-448a-a205-b6e2a8f8fabb',
  '073c88ca-ebf2-4f54-95f8-72be721073d1',
  'f398e791-415a-4880-8e44-409182b10f4b',
  '7a2a82f6-5e2c-40b4-b9b7-9c14ec6aeae9',
  '15b1332d-bc84-48cb-833f-9eae2c056cfa',
  'a8a4400e-eb08-4f59-a743-715a6103d97d',
  '12cbc688-5be4-43ec-8009-9ebd975bf050'
];

for (const uuid of decks) {
  const response = await fetch(`https://nextslide-backend.onrender.com/api/v1/decks/${uuid}/status`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const data = await response.json();
  console.log(`${uuid.substring(0, 8)}: ${data.status} - ${data.progress || 0}% - ${data.message || ''}`);
}
