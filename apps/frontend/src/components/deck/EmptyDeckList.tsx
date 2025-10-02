import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';

interface EmptyDeckListProps {
  searchQuery: string;
  onCreateDeck: () => void;
  authError?: boolean;
  onReload?: () => void;
}

const EmptyDeckList: React.FC<EmptyDeckListProps> = ({ searchQuery, onCreateDeck, authError, onReload }) => {
  if (authError && !searchQuery) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-zinc-300 dark:text-zinc-400">
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

  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-zinc-300 dark:text-zinc-400">
        {searchQuery ? 'No presentations match your search.' : "You haven\'t created any presentations yet"}
      </h3>
      {!searchQuery && (
        <Button 
          onClick={onCreateDeck} 
          className="mt-4"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create your first presentation
        </Button>
      )}
    </div>
  );
};

export default EmptyDeckList; 