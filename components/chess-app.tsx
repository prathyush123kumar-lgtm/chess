/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { signIn, signOut, useSession } from "next-auth/react";
import { type Difficulty, StockfishClient } from "@/lib/stockfish";

type Mode = "ai" | "local";
type GameResult = "white" | "black" | "draw" | null;
type PlayerColorChoice = "white" | "black" | "random";

type SavedGame = {
  date: string;
  mode: Mode;
  result: Exclude<GameResult, null>;
  pgn: string;
};

type ProfileStats = {
  wins: number;
  losses: number;
  draws: number;
  games: SavedGame[];
};

const initialStats: ProfileStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  games: [],
};

function keyForStats(email: string) {
  return `chess-profile:${email}`;
}

function toPlayerColor(choice: PlayerColorChoice): Color {
  if (choice === "random") {
    return Math.random() > 0.5 ? "w" : "b";
  }

  return choice === "white" ? "w" : "b";
}

function formatPiece(piece: PieceSymbol) {
  return piece.toUpperCase();
}

function getKingSquare(chess: Chess, color: Color): Square | null {
  const board = chess.board();

  for (let rankIndex = 0; rankIndex < board.length; rankIndex += 1) {
    const rank = board[rankIndex];

    for (let fileIndex = 0; fileIndex < rank.length; fileIndex += 1) {
      const piece = rank[fileIndex];

      if (piece?.type === "k" && piece.color === color) {
        const file = String.fromCharCode("a".charCodeAt(0) + fileIndex);
        const boardRank = String(8 - rankIndex);
        return `${file}${boardRank}` as Square;
      }
    }
  }

  return null;
}

export function ChessApp() {
  const { data: session } = useSession();
  const gameRef = useRef(new Chess());
  const stockfishRef = useRef<StockfishClient | null>(null);

  const [isGuest, setIsGuest] = useState(false);
  const [mode, setMode] = useState<Mode>("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [colorChoice, setColorChoice] = useState<PlayerColorChoice>("white");
  const [humanColor, setHumanColor] = useState<Color>("w");
  const [autoRotate, setAutoRotate] = useState(true);

  const [fen, setFen] = useState(gameRef.current.fen());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [result, setResult] = useState<GameResult>(null);
  const [resignedWinner, setResignedWinner] = useState<GameResult>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [stats, setStats] = useState<ProfileStats>(initialStats);
  const [hasRecordedResult, setHasRecordedResult] = useState(false);

  const aiColor: Color = humanColor === "w" ? "b" : "w";
  const canPlay = Boolean(session) || isGuest;
  const turn = gameRef.current.turn();

  useEffect(() => {
    const stockfish = new StockfishClient();
    stockfishRef.current = stockfish;

    return () => {
      stockfish.dispose();
    };
  }, []);

  useEffect(() => {
    const email = session?.user?.email;

    if (!email) {
      setStats(initialStats);
      return;
    }

    const raw = window.localStorage.getItem(keyForStats(email));
    if (!raw) {
      setStats(initialStats);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as ProfileStats;
      setStats(parsed);
    } catch {
      setStats(initialStats);
    }
  }, [session?.user?.email]);

  const syncBoard = useCallback(() => {
    setFen(gameRef.current.fen());
  }, []);

  const resetSelections = () => {
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const refreshGame = useCallback(
    (nextHumanColor = humanColor) => {
      gameRef.current = new Chess();
      setHumanColor(nextHumanColor);
      setResult(null);
      setResignedWinner(null);
      setLastMove(null);
      setIsAiThinking(false);
      setHasRecordedResult(false);
      resetSelections();
      syncBoard();
    },
    [humanColor, syncBoard],
  );

  const parseEngineMove = (bestMove: string | null) => {
    if (!bestMove || bestMove.length < 4) {
      return null;
    }

    return {
      from: bestMove.slice(0, 2) as Square,
      to: bestMove.slice(2, 4) as Square,
      promotion: (bestMove.length > 4 ? bestMove[4] : "q") as PieceSymbol,
    };
  };

  const updateResultIfFinished = useCallback(() => {
    if (resignedWinner) {
      setResult(resignedWinner);
      return true;
    }

    if (gameRef.current.isCheckmate()) {
      setResult(gameRef.current.turn() === "w" ? "black" : "white");
      return true;
    }

    if (gameRef.current.isDraw()) {
      setResult("draw");
      return true;
    }

    setResult(null);
    return false;
  }, [resignedWinner]);

  const applyMove = useCallback((from: Square, to: Square, promotion: PieceSymbol = "q") => {
    const move = gameRef.current.move({ from, to, promotion });

    if (!move) {
      return false;
    }

    setLastMove({ from: move.from, to: move.to });
    setResignedWinner(null);
    resetSelections();
    syncBoard();
    updateResultIfFinished();
    return true;
  }, [syncBoard, updateResultIfFinished]);

  const maybePlayAiMove = useCallback(async () => {
    if (mode !== "ai" || gameRef.current.turn() !== aiColor || gameRef.current.isGameOver()) {
      return;
    }

    setIsAiThinking(true);
    const bestMove = await stockfishRef.current?.evaluate(gameRef.current.fen(), difficulty);
    const parsed = parseEngineMove(bestMove ?? null);

    if (parsed) {
      applyMove(parsed.from, parsed.to, parsed.promotion);
    }

    setIsAiThinking(false);
  }, [aiColor, applyMove, difficulty, mode]);

  const startNewGame = useCallback(() => {
    const nextHumanColor = toPlayerColor(colorChoice);
    refreshGame(nextHumanColor);

    if (mode === "ai" && nextHumanColor === "b") {
      queueMicrotask(async () => {
        setIsAiThinking(true);
        const bestMove = await stockfishRef.current?.evaluate(gameRef.current.fen(), difficulty);
        const parsed = parseEngineMove(bestMove ?? null);

        if (parsed) {
          applyMove(parsed.from, parsed.to, parsed.promotion);
        }

        setIsAiThinking(false);
      });
    }
  }, [applyMove, colorChoice, difficulty, mode, refreshGame]);

  useEffect(() => {
    startNewGame();
  }, [mode, startNewGame]);

  useEffect(() => {
    if (!result || hasRecordedResult || !session?.user?.email) {
      return;
    }

    const isDraw = result === "draw";
    const userWon =
      mode === "ai" &&
      ((humanColor === "w" && result === "white") ||
        (humanColor === "b" && result === "black"));

    const userLost = mode === "ai" && !isDraw && !userWon;

    const nextStats: ProfileStats = {
      wins: stats.wins + (userWon ? 1 : 0),
      losses: stats.losses + (userLost ? 1 : 0),
      draws: stats.draws + (isDraw ? 1 : 0),
      games: [
        {
          date: new Date().toISOString(),
          mode,
          result,
          pgn: gameRef.current.pgn(),
        },
        ...stats.games,
      ].slice(0, 20),
    };

    setStats(nextStats);
    window.localStorage.setItem(keyForStats(session.user.email), JSON.stringify(nextStats));
    setHasRecordedResult(true);
  }, [hasRecordedResult, humanColor, mode, result, session?.user?.email, stats]);

  const boardOrientation =
    mode === "local" && autoRotate
      ? gameRef.current.turn() === "w"
        ? "white"
        : "black"
      : humanColor === "w"
        ? "white"
        : "black";

  const checkSquare = gameRef.current.isCheck()
    ? getKingSquare(gameRef.current, gameRef.current.turn())
    : null;

  const highlightedSquares = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};

    for (const square of legalMoves) {
      styles[square] = { background: "rgba(34,197,94,0.35)" };
    }

    if (selectedSquare) {
      styles[selectedSquare] = { background: "rgba(59,130,246,0.35)" };
    }

    if (lastMove) {
      styles[lastMove.from] = { background: "rgba(250,204,21,0.35)" };
      styles[lastMove.to] = { background: "rgba(250,204,21,0.35)" };
    }

    if (checkSquare) {
      styles[checkSquare] = { background: "rgba(239,68,68,0.5)" };
    }

    return styles;
  }, [checkSquare, lastMove, legalMoves, selectedSquare]);

  const moveHistory = gameRef.current.history({ verbose: true });

  const captures = useMemo(() => {
    const white: PieceSymbol[] = [];
    const black: PieceSymbol[] = [];

    for (const move of moveHistory) {
      if (!move.captured) {
        continue;
      }

      if (move.color === "w") {
        white.push(move.captured);
      } else {
        black.push(move.captured);
      }
    }

    return { white, black };
  }, [moveHistory]);

  const statusText = useMemo(() => {
    if (result === "draw") {
      return "Draw / Stalemate";
    }

    if (result === "white") {
      return "Checkmate • White wins";
    }

    if (result === "black") {
      return "Checkmate • Black wins";
    }

    if (isAiThinking) {
      return "AI is thinking...";
    }

    if (gameRef.current.isCheck()) {
      return `Check • ${turn === "w" ? "White" : "Black"} to move`;
    }

    return `${turn === "w" ? "White" : "Black"} to move`;
  }, [isAiThinking, result, turn]);

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (result || isAiThinking || !canPlay) {
      return false;
    }

    const currentTurn = gameRef.current.turn();
    if (mode === "ai" && currentTurn !== humanColor) {
      return false;
    }

    const didMove = applyMove(sourceSquare as Square, targetSquare as Square);

    if (didMove && mode === "ai") {
      void maybePlayAiMove();
    }

    return didMove;
  };

  const onSquareClick = (square: Square) => {
    if (result || isAiThinking || !canPlay) {
      return;
    }

    const currentTurn = gameRef.current.turn();
    if (mode === "ai" && currentTurn !== humanColor) {
      return;
    }

    if (selectedSquare) {
      const didMove = applyMove(selectedSquare, square);
      if (didMove && mode === "ai") {
        void maybePlayAiMove();
      }

      if (didMove) {
        return;
      }
    }

    const piece = gameRef.current.get(square);
    if (!piece || piece.color !== currentTurn) {
      resetSelections();
      return;
    }

    const moves = gameRef.current.moves({ square, verbose: true }).map((move) => move.to);
    setSelectedSquare(square);
    setLegalMoves(moves as Square[]);
  };

  const undoMove = () => {
    if (isAiThinking || gameRef.current.history().length === 0) {
      return;
    }

    gameRef.current.undo();
    if (mode === "ai" && gameRef.current.history().length > 0) {
      gameRef.current.undo();
    }

    setResult(null);
    setResignedWinner(null);
    resetSelections();
    syncBoard();
  };

  const resign = () => {
    if (result) {
      return;
    }

    const winner = gameRef.current.turn() === "w" ? "black" : "white";
    setResignedWinner(winner);
    setResult(winner);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 text-slate-100 sm:p-6 lg:flex-row">
      <section className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl sm:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Modern Chess Arena</h1>
            <p className="text-sm text-slate-300">Play vs AI or pass & play locally</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {session ? (
              <>
                <span className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200">
                  {session.user?.name ?? session.user?.email}
                </span>
                <button
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
                  onClick={() => signOut()}
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
                  onClick={() => signIn("google")}
                  type="button"
                >
                  Sign in with Google
                </button>
                <button
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
                  onClick={() => setIsGuest(true)}
                  type="button"
                >
                  Continue as Guest
                </button>
              </>
            )}
          </div>
        </header>

        {!canPlay ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center text-slate-300">
            Sign in with Google to save your history, or continue as guest to start playing instantly.
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Mode
                  <select
                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1"
                    onChange={(event) => setMode(event.target.value as Mode)}
                    value={mode}
                  >
                    <option value="ai">Play vs AI</option>
                    <option value="local">Pass & Play</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Difficulty
                  <select
                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1"
                    onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                    value={difficulty}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Color
                  <select
                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1"
                    onChange={(event) => setColorChoice(event.target.value as PlayerColorChoice)}
                    value={colorChoice}
                  >
                    <option value="white">White</option>
                    <option value="black">Black</option>
                    <option value="random">Random</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    checked={autoRotate}
                    className="h-4 w-4"
                    onChange={(event) => setAutoRotate(event.target.checked)}
                    type="checkbox"
                  />
                  Auto-rotate (1v1)
                </label>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 sm:p-4">
                <Chessboard
                  options={{
                    allowDragging: !result && !isAiThinking,
                    boardOrientation,
                    id: "modern-chess",
                    onPieceDrop: ({ sourceSquare, targetSquare }) =>
                      onPieceDrop(sourceSquare, targetSquare ?? sourceSquare),
                    onSquareClick: ({ square }) => onSquareClick(square as Square),
                    position: fen,
                    squareStyles: highlightedSquares,
                  }}
                />
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <h2 className="mb-2 text-lg font-semibold text-white">Status</h2>
                <p className="text-sm text-emerald-300">{statusText}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500"
                    onClick={undoMove}
                    type="button"
                  >
                    Undo Move
                  </button>
                  <button
                    className="rounded-md bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
                    onClick={startNewGame}
                    type="button"
                  >
                    Restart Game
                  </button>
                  <button
                    className="rounded-md bg-rose-700 px-3 py-2 text-sm hover:bg-rose-600"
                    onClick={resign}
                    type="button"
                  >
                    Resign
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <h2 className="mb-2 text-lg font-semibold text-white">Captured Pieces</h2>
                <p className="text-sm text-slate-300">White captured: {captures.white.map(formatPiece).join(" ") || "None"}</p>
                <p className="text-sm text-slate-300">Black captured: {captures.black.map(formatPiece).join(" ") || "None"}</p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <h2 className="mb-2 text-lg font-semibold text-white">Move History (PGN)</h2>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
                  {gameRef.current.pgn() || "No moves yet."}
                </pre>
              </div>

              {session && (
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <h2 className="mb-2 text-lg font-semibold text-white">Profile Stats</h2>
                  <p className="text-sm text-slate-300">Wins: {stats.wins}</p>
                  <p className="text-sm text-slate-300">Losses: {stats.losses}</p>
                  <p className="text-sm text-slate-300">Draws: {stats.draws}</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
