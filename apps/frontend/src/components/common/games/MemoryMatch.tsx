import React, { useEffect, useMemo, useRef, useState } from 'react';

type Card = {
  id: number;
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
};

const EMOJIS = ['🍊','🌈','🪄','🎧','🌿','⭐','🧩','🚀'];

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const MemoryMatch: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [firstIndex, setFirstIndex] = useState<number | null>(null);
  const [secondIndex, setSecondIndex] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const lockRef = useRef(false);
  const [pulseMatch, setPulseMatch] = useState<number[] | null>(null);
  const [shakePair, setShakePair] = useState<number[] | null>(null);

  const init = () => {
    const base = EMOJIS.flatMap((e) => [e, e]);
    const deck = shuffle(base).map((symbol, idx) => ({ id: idx, symbol, isFlipped: false, isMatched: false }));
    setCards(deck);
    setFirstIndex(null);
    setSecondIndex(null);
    setMoves(0);
    setWon(false);
    setStartTs(Date.now());
  };

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (cards.length > 0 && cards.every((c) => c.isMatched)) {
      setWon(true);
    }
  }, [cards]);

  const elapsed = useMemo(() => {
    if (!startTs) return 0;
    const s = Math.floor(((won ? Date.now() : Date.now()) - startTs) / 1000);
    return s;
  }, [startTs, won]);

  const handleFlip = (index: number) => {
    if (lockRef.current) return;
    if (cards[index].isMatched || cards[index].isFlipped) return;
    const next = cards.slice();
    next[index] = { ...next[index], isFlipped: true };
    setCards(next);

    if (firstIndex === null) {
      setFirstIndex(index);
      return;
    }
    if (secondIndex === null) {
      setSecondIndex(index);
      setMoves((m) => m + 1);
      const a = next[firstIndex];
      const b = next[index];
      if (a.symbol === b.symbol) {
        // Match
        const updated = next.slice();
        updated[firstIndex] = { ...a, isMatched: true };
        updated[index] = { ...b, isMatched: true };
        setPulseMatch([firstIndex, index]);
        setTimeout(() => {
          setCards(updated);
          setFirstIndex(null);
          setSecondIndex(null);
          setTimeout(() => setPulseMatch(null), 400);
        }, 250);
      } else {
        lockRef.current = true;
        setShakePair([firstIndex, index]);
        setTimeout(() => {
          const reverted = next.slice();
          reverted[firstIndex] = { ...a, isFlipped: false };
          reverted[index] = { ...b, isFlipped: false };
          setCards(reverted);
          setFirstIndex(null);
          setSecondIndex(null);
          lockRef.current = false;
          setShakePair(null);
        }, 650);
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">Moves: <span className="font-semibold text-foreground">{moves}</span></div>
        <div className="text-xs text-muted-foreground">Time: <span className="font-semibold text-foreground">{elapsed}s</span></div>
        <button className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent" onClick={init}>Restart</button>
      </div>
      {won && (
        <div className="mb-2 text-xs font-medium rounded-md px-2 py-1 inline-flex items-center gap-1" style={{ background: 'rgba(99,102,241,0.12)', color: 'rgb(99,102,241)' }}>
          🎉 You won! Try a different layout or another game.
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 select-none">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => handleFlip(i)}
            className={
              "aspect-square rounded-xl flex items-center justify-center text-2xl will-change-transform " +
              (c.isMatched ? ' ring-2 ring-orange-400' : '') +
              (shakePair && shakePair.includes(i) ? ' animate-[mmshake_0.25s_ease]' : '')
            }
            style={{
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              transform: (c.isFlipped || c.isMatched) ? 'rotateY(0deg) scale(' + (pulseMatch && pulseMatch.includes(i) ? 1.05 : 1) + ')' : 'rotateY(180deg)',
              boxShadow: c.isMatched ? '0 8px 18px rgba(249,115,22,0.25)' : 'none',
              background: (c.isFlipped || c.isMatched)
                ? 'linear-gradient(135deg, rgba(255,67,1,0.16), rgba(236,72,153,0.12))'
                : 'rgba(0,0,0,0.04)'
            }}
          >
            <span style={{ opacity: c.isFlipped || c.isMatched ? 1 : 0 }}>{c.symbol}</span>
          </button>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes mmshake { 0% { transform: translateX(0); } 25% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 75% { transform: translateX(-2px);} 100% { transform: translateX(0);} }
      `}} />
    </div>
  );
};

export default MemoryMatch;


