import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, SearchIcon } from 'lucide-react';

interface EmptyDeckListProps {
  searchQuery: string;
  onCreateDeck?: () => void;
  authError?: boolean;
  onReload?: () => void;
  isSearching?: boolean;
}

const EmptyDeckList: React.FC<EmptyDeckListProps> = ({ searchQuery, onCreateDeck, authError, onReload, isSearching }) => {
  if (authError && !searchQuery) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
          Unable to load presentations
        </h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-2">
          There was an issue loading your presentations. Please try again.
        </p>
        <Button
          onClick={onReload}
          className="mt-4"
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload
        </Button>
      </div>
    );
  }

  // Show loading state while searching
  if (isSearching && searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Searching...</p>
      </div>
    );
  }

  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <SearchIcon className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">No results for "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <p className="text-sm text-zinc-400 dark:text-zinc-500">No presentations yet</p>
    </div>
  );
};

export default EmptyDeckList; 