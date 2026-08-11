export type Difficulty = "easy" | "medium" | "hard";

const depthByDifficulty: Record<Difficulty, number> = {
  easy: 8,
  medium: 12,
  hard: 16,
};

export class StockfishClient {
  private worker: Worker | null = null;
  private pendingResolver: ((bestMove: string | null) => void) | null = null;

  constructor(workerUrl = "/stockfish/stockfish.js") {
    if (typeof window === "undefined") {
      return;
    }

    this.worker = new Worker(workerUrl);
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.postMessage("uci");
    this.worker.postMessage("isready");
  }

  private handleMessage = (event: MessageEvent<string>) => {
    const line = String(event.data || "");

    if (!line.startsWith("bestmove") || !this.pendingResolver) {
      return;
    }

    const bestMove = line.split(" ")[1] ?? null;
    this.pendingResolver(bestMove === "(none)" ? null : bestMove);
    this.pendingResolver = null;
  };

  evaluate(fen: string, difficulty: Difficulty): Promise<string | null> {
    const depth = depthByDifficulty[difficulty];

    return new Promise((resolve) => {
      if (!this.worker) {
        resolve(null);
        return;
      }

      if (this.pendingResolver) {
        this.pendingResolver(null);
      }

      this.pendingResolver = resolve;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  dispose() {
    if (!this.worker) {
      return;
    }

    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.terminate();
    this.worker = null;
    this.pendingResolver = null;
  }
}
