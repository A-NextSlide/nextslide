import React, { useState, useEffect, useRef } from 'react';

interface BlobAnimationProps {
  isLoading: boolean;
  isProcessing: boolean; // General processing prop (e.g., outline generation, research)
  isDeleting: boolean;
}

const BlobAnimation: React.FC<BlobAnimationProps> = ({
  isLoading,
  isProcessing,
  isDeleting,
}) => {
  // Create refs only once to avoid infinite loops
  const blobRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  
  // Initialize refs only once
  if (blobRefs.current.length === 0) {
    for (let i = 0; i < 6; i++) {
      blobRefs.current.push(React.createRef<HTMLDivElement>());
    }
  }
  const [shouldAnimate, setShouldAnimate] = useState(true);
  const [showAnimatedBlobs, setShowAnimatedBlobs] = useState(true);
  const [showEdgeBlobs, setShowEdgeBlobs] = useState(false);
  const initialLoadComplete = useRef(false);
  const isMountedRef = React.useRef(true);

  // Effect for setting mount status (should be at top level)
  useEffect(() => { 
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Effect for initial visit check (same as before)
  useEffect(() => {
    let isMounted = true;
    try {
      const hasVisitedBefore = sessionStorage.getItem('hasVisitedDeckList') === 'true';
      if (hasVisitedBefore && isMounted) {
        setShowAnimatedBlobs(false);
        setShowEdgeBlobs(true);
        setShouldAnimate(false);
      }
    } catch (e) {
      console.error('Session storage error:', e);
    }
    
    return () => {
      isMounted = false;
      if (initialLoadComplete.current) {
        try {
          sessionStorage.setItem('hasVisitedDeckList', 'true');
        } catch (e) {
          console.error('Session storage error:', e);
        }
      }
    };
  }, []); // Empty dependency array, runs once on mount

  // Effect for handling transitions based on loading/processing states
  useEffect(() => {
    let transitionTimer: NodeJS.Timeout | null = null; // Single timer for transition end
    
    const isAnyLoading = isLoading || isProcessing || isDeleting;

    if (isAnyLoading) {
      // Start loading: Show animated blobs immediately
      if (transitionTimer) clearTimeout(transitionTimer);
      setShouldAnimate(true);
      setShowEdgeBlobs(false); // Make sure edge blobs are hidden first
      setShowAnimatedBlobs(true); // Then show animated blobs
      return; // Keep animated blobs visible while loading
    }

    // Logic only runs when all loading states become false
    if (!isAnyLoading) {
        
      // Check if it's the initial load completion
      if (!initialLoadComplete.current) {
         // This block handles the VERY first page load completion
         initialLoadComplete.current = true;
         const hasVisitedBefore = sessionStorage.getItem('hasVisitedDeckList') === 'true';

         if (!hasVisitedBefore) {
             // First ever visit: perform the nice transition
             setShowAnimatedBlobs(false);
             transitionTimer = setTimeout(() => {
                 if (!isMountedRef.current) return; // Check mount status
                 setShowEdgeBlobs(true);
                 setShouldAnimate(false);
                 // Mark visited after transition completes
                 try { sessionStorage.setItem('hasVisitedDeckList', 'true'); } catch (e) { console.error('Session storage error:', e); }
             }, 800); // Transition duration (should match CSS)
         } else {
             // Visited before, initial load: Instant switch
             setShowAnimatedBlobs(false);
             setShowEdgeBlobs(true);
             setShouldAnimate(false);
         }
      } else {
         // Subsequent load completions (e.g., after outline generation)
         // Use simpler single-timer logic aligned with CSS transition
         if (showAnimatedBlobs) { 
             setShowAnimatedBlobs(false); // Start the fade-out (triggers 800ms CSS transition)
             // Set timer to match the CSS transition duration
             transitionTimer = setTimeout(() => {
                 if (!isMountedRef.current) return; // Check component is still mounted
                 setShowEdgeBlobs(true);      // Fade in edge blobs
                 setShouldAnimate(false);     // Stop background animation calculations
             }, 800); // Match the CSS transition duration
         } else {
             // If animated blobs weren't showing (e.g., already transitioned), 
             // ensure edge blobs are shown and animation is stopped.
             if (!showEdgeBlobs) setShowEdgeBlobs(true);
             if (shouldAnimate) setShouldAnimate(false);
         }
      }
    }
    
    // Cleanup timers on unmount or if dependencies change before timers fire
    return () => {
        if (transitionTimer) clearTimeout(transitionTimer); // Clear the single timer
    };

  }, [isLoading, isProcessing, isDeleting]); // Dependency array remains focused on loading states

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
      <div className="blobs-container">
        {/* Animated center blobs */}
        <div className="animated-blobs-container" style={{ opacity: showAnimatedBlobs ? 1 : 0, transition: 'opacity 0.8s ease-out' }}>
          <div ref={blobRefs.current[0]} className={`blob blob-1 ${shouldAnimate ? 'animate-blob-1' : ''}`}></div>
          <div ref={blobRefs.current[1]} className={`blob blob-2 ${shouldAnimate ? 'animate-blob-2' : ''}`}></div>
          <div ref={blobRefs.current[2]} className={`blob blob-3 ${shouldAnimate ? 'animate-blob-3' : ''}`}></div>
          <div ref={blobRefs.current[3]} className={`blob blob-4 ${shouldAnimate ? 'animate-blob-4' : ''}`}></div>
          <div ref={blobRefs.current[4]} className={`blob blob-5 ${shouldAnimate ? 'animate-blob-5' : ''}`}></div>
          <div ref={blobRefs.current[5]} className={`blob blob-6 ${shouldAnimate ? 'animate-blob-6' : ''}`}></div>
        </div>

        {/* Edge positioned blobs */}
        <div className="edge-blobs-container" style={{ opacity: showEdgeBlobs ? 1 : 0, transition: 'opacity 0.8s ease-in' }}>
          <div className="blob blob-1 edge-blob" style={{ position: 'absolute', left: '-65%', top: '-45%', animationPlayState: 'paused' }}></div>
          <div className="blob blob-2 edge-blob" style={{ position: 'absolute', right: '-75%', top: '-55%', animationPlayState: 'paused' }}></div>
          <div className="blob blob-3 edge-blob" style={{ position: 'absolute', left: '-70%', bottom: '-60%', animationPlayState: 'paused' }}></div>
          <div className="blob blob-4 edge-blob" style={{ position: 'absolute', right: '-65%', bottom: '-50%', animationPlayState: 'paused' }}></div>
          <div className="blob blob-5 edge-blob" style={{ position: 'absolute', left: '-10%', bottom: '-70%', animationPlayState: 'paused' }}></div>
          <div className="blob blob-6 edge-blob" style={{ position: 'absolute', right: '-15%', top: '-65%', animationPlayState: 'paused' }}></div>
        </div>
      </div>
      {/* Styles can be included here or ideally moved to a global CSS file if not already */}
      <style>{`
          .blobs-container {
            position: absolute;
            width: 100%;
            height: 100%;
            overflow: hidden;
            filter: blur(70px);
            opacity: 0.5;
            z-index: 0; 
          }
          
          .animated-blobs-container, .edge-blobs-container {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            will-change: opacity;
            transition-property: opacity;
            transition-duration: 0.8s;
            transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          }
          
          .blob {
            position: absolute;
            filter: blur(35px);
            mix-blend-mode: screen;
            transform-origin: center;
            will-change: transform, border-radius, opacity;
          }
          
          .edge-blob {
            position: absolute;
            filter: blur(35px);
            mix-blend-mode: screen;
          }
          
                .blob-1 { background: linear-gradient(135deg, #FF6B4A 0%, #FF4301 100%); width: 80%; height: 80%; left: -60%; top: -40%; border-radius: 73% 27% 59% 41% / 57% 43% 57% 43%; }
      .blob-2 { background: linear-gradient(135deg, #FF8A65 0%, #FF6B4A 100%); width: 90%; height: 90%; right: -70%; top: -50%; border-radius: 42% 58% 37% 63% / 54% 35% 65% 46%; }
                      .blob-3 { background: linear-gradient(135deg, #FF8762 0%, #FF5F47 100%); width: 85%; height: 85%; left: -65%; bottom: -55%; border-radius: 53% 47% 32% 68% / 47% 32% 68% 53%; }
          .blob-4 { background: linear-gradient(135deg, #FF9575 0%, #FF5722 100%); width: 75%; height: 75%; right: -60%; bottom: -45%; border-radius: 63% 37% 57% 43% / 37% 53% 47% 63%; }
          .blob-5 { background: linear-gradient(135deg, #F08080 0%, #CD5C5C 100%); width: 80%; height: 80%; left: -5%; bottom: -65%; border-radius: 48% 52% 55% 45% / 40% 60% 40% 60%; }
          .blob-6 { background: linear-gradient(135deg, #FFA07A 0%, #FF7F50 100%); width: 88%; height: 88%; right: -10%; top: -60%; border-radius: 60% 40% 45% 55% / 50% 45% 55% 50%; }
          
          /* Animation classes */
          .animate-blob-1 { animation: morph-1 18s ease-in-out infinite alternate, float-1 30s ease-in-out infinite alternate; animation-play-state: running !important; }
          .animate-blob-2 { animation: morph-2 20s ease-in-out infinite alternate, float-2 34s ease-in-out infinite alternate; animation-play-state: running !important; }
          .animate-blob-3 { animation: morph-3 22s ease-in-out infinite alternate, float-3 28s ease-in-out infinite alternate; animation-play-state: running !important; }
          .animate-blob-4 { animation: morph-4 24s ease-in-out infinite alternate, float-4 32s ease-in-out infinite alternate; animation-play-state: running !important; }
          .animate-blob-5 { animation: morph-5 23s ease-in-out infinite alternate, float-5 30s ease-in-out infinite alternate; animation-play-state: running !important; }
          .animate-blob-6 { animation: morph-6 25s ease-in-out infinite alternate, float-6 36s ease-in-out infinite alternate; animation-play-state: running !important; }
          
          /* Keyframes (float-1 to float-6, morph-1 to morph-6) */
          @keyframes float-1 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(30vw, 20vh) rotate(15deg) scale(1.1); } 50% { transform: translate(-25vw, -30vh) rotate(-10deg) scale(0.9); } 75% { transform: translate(20vw, -25vh) rotate(10deg) scale(1.05); } 100% { transform: translate(-30vw, 25vh) rotate(-15deg) scale(1); } }
          @keyframes float-2 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(-35vw, 25vh) rotate(-12deg) scale(1.1); } 50% { transform: translate(30vw, -35vh) rotate(18deg) scale(0.95); } 75% { transform: translate(-20vw, 30vh) rotate(-8deg) scale(1.05); } 100% { transform: translate(25vw, -20vh) rotate(15deg) scale(1); } }
          @keyframes float-3 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(25vw, -30vh) rotate(10deg) scale(1.08); } 50% { transform: translate(-30vw, 25vh) rotate(-15deg) scale(0.92); } 75% { transform: translate(35vw, 20vh) rotate(12deg) scale(1.06); } 100% { transform: translate(-20vw, -25vh) rotate(-10deg) scale(1); } }
          @keyframes float-4 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(-30vw, -20vh) rotate(-14deg) scale(1.12); } 50% { transform: translate(25vw, 35vh) rotate(20deg) scale(0.88); } 75% { transform: translate(-35vw, -25vh) rotate(-10deg) scale(1.03); } 100% { transform: translate(20vw, 30vh) rotate(16deg) scale(1); } }
          @keyframes float-5 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(20vw, 30vh) rotate(8deg) scale(1.07); } 50% { transform: translate(-25vw, -20vh) rotate(-12deg) scale(0.93); } 75% { transform: translate(30vw, -25vh) rotate(14deg) scale(1.04); } 100% { transform: translate(-35vw, 20vh) rotate(-18deg) scale(1); } }
          @keyframes float-6 { 0% { transform: translate(0%, 0%) rotate(0deg) scale(1); } 25% { transform: translate(-28vw, 22vh) rotate(-10deg) scale(1.09); } 50% { transform: translate(32vw, -30vh) rotate(16deg) scale(0.91); } 75% { transform: translate(-22vw, 28vh) rotate(-14deg) scale(1.02); } 100% { transform: translate(28vw, -22vh) rotate(12deg) scale(1); } }
          @keyframes morph-1 { 0% { border-radius: 73% 27% 59% 41% / 57% 43% 57% 43%; } 20% { border-radius: 56% 44% 49% 51% / 41% 59% 41% 59%; } 40% { border-radius: 36% 64% 63% 37% / 43% 37% 63% 57%; } 60% { border-radius: 57% 43% 41% 59% / 53% 47% 53% 47%; } 80% { border-radius: 51% 49% 31% 69% / 65% 39% 61% 35%; } 100% { border-radius: 54% 46% 38% 62% / 49% 70% 30% 51%; } }
          @keyframes morph-2 { 0% { border-radius: 42% 58% 37% 63% / 54% 35% 65% 46%; } 20% { border-radius: 53% 47% 49% 51% / 47% 53% 47% 53%; } 40% { border-radius: 72% 28% 65% 35% / 41% 74% 26% 59%; } 60% { border-radius: 44% 56% 47% 53% / 51% 49% 51% 49%; } 80% { border-radius: 31% 69% 58% 42% / 69% 31% 69% 31%; } 100% { border-radius: 61% 39% 45% 55% / 35% 61% 39% 65%; } }
          @keyframes morph-3 { 0% { border-radius: 53% 47% 32% 68% / 47% 32% 68% 53%; } 20% { border-radius: 61% 39% 46% 54% / 39% 61% 39% 61%; } 40% { border-radius: 69% 31% 50% 50% / 30% 62% 38% 70%; } 60% { border-radius: 51% 49% 51% 49% / 49% 51% 49% 51%; } 80% { border-radius: 44% 56% 66% 34% / 65% 31% 69% 35%; } 100% { border-radius: 57% 43% 28% 72% / 39% 57% 43% 61%; } }
          @keyframes morph-4 { 0% { border-radius: 63% 37% 57% 43% / 37% 53% 47% 63%; } 20% { border-radius: 51% 49% 48% 52% / 39% 51% 49% 61%; } 40% { border-radius: 40% 60% 29% 71% / 69% 36% 64% 31%; } 60% { border-radius: 47% 53% 43% 57% / 52% 49% 51% 47%; } 80% { border-radius: 72% 28% 68% 32% / 39% 55% 45% 61%; } 100% { border-radius: 35% 65% 50% 50% / 55% 42% 58% 45%; } }
          @keyframes morph-5 { 0% { border-radius: 48% 52% 55% 45% / 40% 60% 40% 60%; } 50% { border-radius: 60% 40% 45% 55% / 50% 45% 55% 50%; } 100% { border-radius: 48% 52% 55% 45% / 40% 60% 40% 60%; } }
          @keyframes morph-6 { 0% { border-radius: 60% 40% 45% 55% / 50% 45% 55% 50%; } 50% { border-radius: 45% 55% 52% 48% / 58% 42% 58% 42%; } 100% { border-radius: 60% 40% 45% 55% / 50% 45% 55% 50%; } }
          
          /* Dark mode adjustments */
          @media (prefers-color-scheme: dark) {
            .blobs-container { opacity: 0.6; }
            .blob { mix-blend-mode: lighten; }
            .blob-1 { background: linear-gradient(135deg, #FF5F47 0%, #D84315 100%); }
            .blob-2 { background: linear-gradient(135deg, #FF4301 0%, #FF5F47 100%); }
            .blob-3 { background: linear-gradient(135deg, #D84315 0%, #E64A19 100%); }
            .blob-4 { background: linear-gradient(135deg, #FF6B4A 0%, #FF7043 100%); }
            .blob-5 { background: linear-gradient(135deg, #FF5722 0%, #FF5F47 100%); }
            .blob-6 { background: linear-gradient(135deg, #FF7F50 0%, #FF4500 100%); }
          }
          :global(.dark) .blobs-container { opacity: 0.6; }
          :global(.dark) .blob { mix-blend-mode: lighten; }
          :global(.dark) .blob-1 { background: linear-gradient(135deg, #FF5F47 0%, #D84315 100%); }
          :global(.dark) .blob-2 { background: linear-gradient(135deg, #FF4301 0%, #FF5F47 100%); }
          :global(.dark) .blob-3 { background: linear-gradient(135deg, #D84315 0%, #E64A19 100%); }
          :global(.dark) .blob-4 { background: linear-gradient(135deg, #FF6B4A 0%, #FF7043 100%); }
          :global(.dark) .blob-5 { background: linear-gradient(135deg, #FF5722 0%, #FF5F47 100%); }
          :global(.dark) .blob-6 { background: linear-gradient(135deg, #FF7F50 0%, #FF4500 100%); }
      `}</style>
    </div>
  );
};

export default BlobAnimation; 