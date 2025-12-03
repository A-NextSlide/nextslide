import React from 'react';

interface LoadingDisplayProps {
  message?: string;
}

const LoadingDisplay: React.FC<LoadingDisplayProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-black relative overflow-hidden">
      <div className="flex flex-col items-center gap-8">
        {/* Simple spinner */}
        <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#FF4301] rounded-full animate-spin" />

        <p
          className="text-[#383636] dark:text-gray-300 z-10"
          style={{
            fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
            fontWeight: 900,
            fontSize: '24px',
            lineHeight: '120%',
            letterSpacing: '0%',
            textTransform: 'uppercase',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale'
          }}
        >
          {message || 'Loading...'}
        </p>
      </div>
    </div>
  );
};

export default LoadingDisplay;
