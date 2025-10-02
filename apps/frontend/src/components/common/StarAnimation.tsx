import React, { useEffect, useRef } from 'react';

interface StarAnimationProps {
  isLoading: boolean;
  isProcessing: boolean;
  isDeleting: boolean;
  isVisible?: boolean;
}

const StarAnimation: React.FC<StarAnimationProps> = ({
  isLoading,
  isProcessing,
  isDeleting,
  isVisible = true,
}) => {
  const starRef = useRef<SVGSVGElement>(null);
  const isAnimating = isLoading || isProcessing || isDeleting;

  if (!isVisible) return null;

  return (
    <div className="star-animation-container">
      <div className={`star-wrapper ${isAnimating ? 'animating' : ''}`}>
        <svg
          ref={starRef}
          width="100%"
          height="100%"
          viewBox="0 0 536 707"
          className="star-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform="scale(1, 1)" fill="#FF4301">
            <path d="M127 2.8 c-5.7 2.5 -9 7.3 -9 13 0 3.8 6.2 16.6 46.2 95.5 29.3 57.8 46.4 92.5 46.6 94.8 0.5 4.7 -2.9 11.4 -7.1 13.9 -6.1 3.8 -9.3 3 -47 -11.6 -19.4 -7.6 -37.3 -14.3 -39.9 -15 -6.2 -1.7 -10.7 -0.4 -14.7 4.1 -3.6 4.2 -4.8 9.3 -3.2 14.6 1 3.4 5 6.9 36.5 32.4 30.1 24.3 35.6 29.1 37 32.5 2 5.1 2 6.5 -0.3 11.6 -3.5 7.7 -3.8 7.8 -48.8 15 -25.4 4.1 -42.3 7.3 -44.8 8.5 -5.1 2.4 -7.5 6.3 -7.5 12.6 0 5.6 2.6 10.5 6.7 12.6 1.5 0.8 21.5 4.5 44.3 8.2 45.1 7.3 47.7 8 51.2 14.5 2.2 4.2 2.3 10.1 0.3 13.9 -0.8 1.6 -39.1 35.5 -85.2 75.3 -46.1 39.9 -84.4 73.2 -85.1 74 -3.9 4.8 -3.3 13.1 1.4 18.7 3.1 3.7 9.5 5.7 13.9 4.4 1.6 -0.6 41.7 -25.7 89 -56 47.3 -30.2 87 -55.5 88.2 -56.1 3.8 -2.1 10.5 -1.4 14.6 1.3 4.4 3 6.7 7.1 6.7 11.9 0 2 -6.1 25.6 -13.5 52.6 -7.4 26.9 -13.5 50.7 -13.5 52.7 0 10.4 11.5 17 20.9 12.1 4.2 -2.2 5.6 -4.2 27.1 -40.8 13.3 -22.5 23.8 -39.3 25.4 -40.5 3.9 -2.9 13.4 -2.8 17.3 0.1 6.4 4.8 5.8 -0.5 13.8 110.5 8.2 112.2 7.6 107.3 14.5 111.1 4.8 2.5 10.9 2.3 15.1 -0.5 6.9 -4.6 6.2 0.9 14.7 -117.4 7.3 -100.6 7.9 -108.5 9.8 -111 5.3 -7.2 13.3 -9.2 20.3 -5.2 2.1 1.2 17.3 17.9 37.1 40.6 18.4 21.2 34.2 38.9 35 39.3 6.4 3.5 16.2 0.9 20 -5.2 4.1 -6.5 3.2 -9.2 -19.4 -56.3 -21.8 -45.6 -22.6 -47.8 -19.2 -54.3 2.7 -5.1 6.2 -7.5 11.8 -7.9 4.9 -0.4 8.3 0.7 43.3 14.3 20.9 8.1 39.8 14.9 42 15.1 11.1 1.2 19.3 -12.7 13.1 -22.2 -0.9 -1.3 -18.7 -16.2 -39.6 -33.1 -21.3 -17.1 -38.7 -31.9 -39.5 -33.5 -2.2 -4.2 -1.9 -11 0.7 -15 1.8 -2.6 5.3 -4.9 15.8 -10 15.5 -7.6 18 -10.1 18 -17.9 0 -8.2 -2.4 -10.5 -19.7 -19 -8.4 -4.1 -16.4 -8.6 -17.8 -9.9 -3 -2.9 -4.9 -9.1 -4 -13.1 0.4 -1.6 11 -17.4 23.7 -35.2 12.7 -17.7 23.5 -33.5 24.1 -35.1 3.1 -9 -4.3 -18.7 -14.3 -18.7 -3.8 0 -6.3 1.1 -15.5 6.6 -14.9 9 -17.9 10.4 -21.7 10.4 -4.5 0 -9.8 -3 -12.6 -7.1 -2 -2.8 -2.3 -4.3 -1.9 -8.9 0.4 -4.8 5.6 -15.5 43.2 -89.5 29.3 -57.4 42.9 -85.3 43.2 -88.1 0.6 -4.6 -1.1 -8.6 -5.1 -12.3 -3.3 -3.1 -11.9 -4.1 -16.3 -1.8 -2.1 1.1 -20.6 26.3 -63.6 86.6 -33.4 46.8 -61.9 85.8 -63.3 86.7 -1.4 1 -4.6 1.9 -7.2 2.1 -3.8 0.4 -5.4 0 -8.1 -1.9 -6.9 -4.7 -6.8 -4.5 -13.7 -47.9 -3.4 -22.2 -6.8 -42.1 -7.4 -44.1 -1.9 -6.7 -9.6 -10.9 -17 -9.3 -4.2 0.9 -9.7 5.9 -10.5 9.4 -0.3 1.6 -3.5 21.2 -7 43.7 -4.9 31.2 -6.8 41.3 -8.2 43.3 -3.2 4.2 -6.9 6.4 -12 6.8 -3.9 0.4 -5.5 0 -8.3 -1.9 -2.4 -1.6 -22.7 -29.2 -63.9 -86.9 -35.5 -49.7 -61.6 -85.3 -63.2 -86.3 -2.7 -1.6 -10.1 -2.1 -12.9 -0.8z"/>
          </g>
        </svg>
      </div>
      
      <style>{`
        .star-animation-container {
          width: 100%;
          height: 100%;
          position: relative;
          pointer-events: none;
        }
        
        .star-wrapper {
          width: 100%;
          height: 100%;
          position: relative;
          transform: scale(0.8);
          transition: transform 0.3s ease-out;
          opacity: 0;
          animation: starFadeIn 0.7s ease-out forwards;
        }
        
        .star-svg {
          filter: drop-shadow(0 0 20px rgba(255, 67, 1, 0.3));
        }
        
        .star-body {
          transform-origin: center;
          transition: all 0.3s ease-out;
        }
        
        .star-wrapper.animating svg {
          animation: starPulse 3s ease-in-out infinite;
        }
        
        @keyframes starPulse {
          0% {
            transform: scale(0.8);
          }
          50% {
            transform: scale(0.84);
          }
          100% {
            transform: scale(0.8);
          }
        }
        
        @keyframes starFadeIn {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(0.8);
          }
        }
      `}</style>
    </div>
  );
};

export default StarAnimation; 