import React from 'react';

interface CenteredProcessingLoaderProps {
  text?: string;
}

const CenteredProcessingLoader: React.FC<CenteredProcessingLoaderProps> = ({ text = 'Processing your files...' }) => {
  return (
    <div className="w-full flex items-center justify-center py-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
    </div>
  );
};

export default CenteredProcessingLoader;


