import React, { useEffect, useMemo, useState } from 'react';

interface SlidingPuzzleProps {
  size?: number; // nxn
}

const isSolvable = (arr: number[], size: number) => {
  const a = arr.filter((n) => n !== 0);
  let inv = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if (a[i] > a[j]) inv++;
    }
  }
  if (size % 2 === 1) return inv % 2 === 0;
  const blankRowFromBottom = size - Math.floor(arr.indexOf(0) / size);
  if (blankRowFromBottom % 2 === 0) return inv % 2 === 1;
  return inv % 2 === 0;
};

const shuffleSolvable = (size: number) => {
  const arr = Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
  let candidate = arr.slice();
  const swap = (i: number, j: number) => {
    const t = candidate[i];
    candidate[i] = candidate[j];
    candidate[j] = t;
  };
  do {
    // Fisher-Yates
    candidate = arr.slice();
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      swap(i, j);
    }
  } while (!isSolvable(candidate, size) || isSolved(candidate));
  return candidate;
};

const isSolved = (arr: number[]) => arr.every((v, i) => v === ((i + 1) % arr.length));

const SlidingPuzzle: React.FC<SlidingPuzzleProps> = ({ size = 3 }) => {
  const [tiles, setTiles] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [lastMoveIdx, setLastMoveIdx] = useState<number | null>(null);

  const init = () => {
    const s = Math.max(3, Math.min(5, size));
    setTiles(shuffleSolvable(s));
    setMoves(0);
    setWon(false);
  };

  useEffect(() => { init(); }, [size]);

  useEffect(() => { if (tiles.length && isSolved(tiles)) setWon(true); }, [tiles]);

  const s = Math.sqrt(tiles.length) | 0;
  const zeroIdx = tiles.indexOf(0);
  const zx = zeroIdx % s;
  const zy = Math.floor(zeroIdx / s);

  const tryMove = (idx: number) => {
    if (won) return;
    const x = idx % s;
    const y = Math.floor(idx / s);
    const can = (Math.abs(x - zx) + Math.abs(y - zy)) === 1;
    if (!can) return;
    const next = tiles.slice();
    [next[idx], next[zeroIdx]] = [next[zeroIdx], next[idx]];
    setTiles(next);
    setMoves((m) => m + 1);
    setLastMoveIdx(idx);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">Moves: <span className="font-semibold text-foreground">{moves}</span></div>
        <button className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent" onClick={init}>Shuffle</button>
      </div>
      {won && (
        <div className="mb-2 text-xs font-medium rounded-md px-2 py-1 inline-flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' }}>
          ✅ Solved! Great job.
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${s}, minmax(0, 1fr))` }}>
        {tiles.map((v, i) => (
          <button
            key={`${v}-${i}`}
            disabled={v === 0}
            onClick={() => tryMove(i)}
            className={"aspect-square rounded-xl flex items-center justify-center text-base font-semibold will-change-transform " + (v === 0 ? 'bg-transparent' : '')}
            style={{
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              transform: lastMoveIdx === i ? 'scale(1.03)' : 'scale(1)',
              background: v !== 0 ? 'linear-gradient(135deg, rgba(255,67,1,0.16), rgba(236,72,153,0.12))' : 'transparent',
              boxShadow: v !== 0 ? 'inset 0 0 0 1px rgba(255,67,1,0.25)' : 'none'
            }}
          >
            {v !== 0 ? v : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SlidingPuzzle;


