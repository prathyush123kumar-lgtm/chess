import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const sourceJs = resolve(root, "node_modules", "stockfish", "bin", "stockfish-18-lite-single.js");
const sourceWasm = resolve(root, "node_modules", "stockfish", "bin", "stockfish-18-lite-single.wasm");
const targetDir = resolve(root, "public", "stockfish");

await mkdir(targetDir, { recursive: true });
await copyFile(sourceJs, resolve(targetDir, "stockfish.js"));
await copyFile(sourceWasm, resolve(targetDir, "stockfish.wasm"));
