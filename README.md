# Modern Chess Arena

A responsive Next.js chess website with:
- Google OAuth sign-in via NextAuth.js
- Guest mode (no sign-in required)
- Play vs AI (Stockfish in a Web Worker) with Easy/Medium/Hard
- Local pass-and-play with optional auto-rotate
- Move history (PGN), captured pieces, status, undo/restart/resign controls

## Tech Stack
- Next.js + React + TypeScript
- Tailwind CSS
- chess.js
- react-chessboard
- NextAuth.js
- Stockfish.js

## Setup Commands
```bash
# 1) Install dependencies
npm install

# 2) Create env file for OAuth
cp .env.example .env.local

# 3) Run dev server
npm run dev

# 4) Lint
npm run lint

# 5) Production build
npm run build
```

## Project Structure
```text
.
├── app
│   ├── api/auth/[...nextauth]/route.ts   # NextAuth route handlers
│   ├── globals.css
│   ├── layout.tsx                         # Root layout + auth provider
│   ├── page.tsx                           # Main app page
│   └── providers.tsx                      # SessionProvider wrapper
├── components
│   └── chess-app.tsx                      # Main game controller + UI
├── lib
│   └── stockfish.ts                       # Stockfish worker client wrapper
├── public/stockfish
│   ├── stockfish.js                       # Copied Stockfish engine
│   └── stockfish.wasm
├── scripts
│   └── setup-stockfish.mjs                # Copies stockfish assets after install
├── .env.example
└── README.md
```

## Notes
- Google OAuth requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from Google Cloud Console.
- Guest mode works without any authentication setup.
- Signed-in users get local profile/game history persistence in browser storage.
