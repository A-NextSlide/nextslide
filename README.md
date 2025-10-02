# NextSlide

AI-powered slide generation platform.

## Structure

```
nextslide/
├── apps/
│   ├── frontend/    # React + Vite + TypeScript frontend
│   └── backend/     # Python FastAPI backend
```

## Getting Started

### Frontend

```bash
npm run frontend
# or
npm run dev:frontend
```

### Backend

```bash
# First time setup
cd apps/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run the backend
npm run backend
# or
npm run dev:backend
```

## Development

- Frontend runs on `http://localhost:5173` (Vite default)
- Backend API runs on `http://localhost:8000` (FastAPI default)

Both projects maintain their original configurations and can be developed independently within the monorepo structure.
