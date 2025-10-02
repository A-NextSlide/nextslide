import React, { useEffect, useMemo, useState } from 'react';

interface LightsOutProps {
  size?: number; // nxn
}

const toggle = (grid: boolean[], size: number, idx: number) => {
  const g = grid.slice();
  const x = idx % size;
  const y = Math.floor(idx / size);
  const idxOf = (cx: number, cy: number) => (cy * size + cx);
  const flip = (cx: number, cy: number) => {
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) return;
    const i = idxOf(cx, cy);
    g[i] = !g[i];
  };
  flip(x, y);
  flip(x + 1, y);
  flip(x - 1, y);
  flip(x, y + 1);
  flip(x, y - 1);
  return g;
};

const randomGrid = (size: number) => Array.from({ length: size * size }, () => Math.random() > 0.5);

const LightsOut: React.FC<LightsOutProps> = ({ size = 5 }) => {
  const s = Math.max(3, Math.min(6, size));
  const [grid, setGrid] = useState<boolean[]>(() => randomGrid(s));
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [hintPulse, setHintPulse] = useState<number | null>(null);

  const init = () => {
    setGrid(randomGrid(s));
    setMoves(0);
    setWon(false);
  };

  useEffect(() => { init(); }, [s]);
  useEffect(() => {
    if (grid.length && grid.every((c) => !c)) setWon(true);
  }, [grid]);

  const click = (idx: number) => {
    if (won) return;
    setGrid((g) => toggle(g, s, idx));
    setMoves((m) => m + 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">Moves: <span className="font-semibold text-foreground">{moves}</span></div>
        <button className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent" onClick={init}>New board</button>
      </div>
      {won && (
        <div className="mb-2 text-xs font-medium rounded-md px-2 py-1 inline-flex items-center gap-1" style={{ background: 'rgba(234,179,8,0.12)', color: 'rgb(234,179,8)' }}>
          🌟 Lights out! You cleared the board.
        </div>
      )}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s}, minmax(0, 1fr))` }}>
        {grid.map((on, i) => (
          <button
            key={i}
            onClick={() => click(i)}
            className="aspect-square rounded-xl"
            style={{
              background: on
                ? 'radial-gradient(ellipse at center, rgba(251,146,60,0.95), rgba(236,72,153,0.75))'
                : 'linear-gradient(135deg, rgba(255,67,1,0.10), rgba(236,72,153,0.08))',
              boxShadow: on
                ? '0 0 18px rgba(249,115,22,0.6) inset, inset 0 0 0 1px rgba(255,67,1,0.35)'
                : 'inset 0 0 0 1px rgba(255,67,1,0.20)',
              transition: 'transform 0.12s ease',
              transform: on ? 'scale(1.02)' : 'scale(1)'
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default LightsOut;


