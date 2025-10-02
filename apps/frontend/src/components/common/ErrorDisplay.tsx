import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';

interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F5F5DC] dark:bg-zinc-900 relative">
      <div className="noise-overlay pointer-events-none"></div>
      <div className="w-full max-w-md relative z-10">
        <Alert variant="destructive" className="mb-6 border-red-200 dark:border-red-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          className="w-full bg-orange-500 hover:bg-orange-600 text-white" 
          onClick={onRetry}
        >
          Try Again
        </Button>
      </div>
    </div>
  );
};

export default ErrorDisplay; 