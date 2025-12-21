import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ActionButton } from '../types';

interface MessageActionsProps {
  buttons: ActionButton[];
  onAction: (action: string) => void;
  isProcessing: boolean;
}

const MessageActions: React.FC<MessageActionsProps> = ({ buttons, onAction, isProcessing }) => {
  if (!buttons.length) return null;

  return (
    <div className="flex gap-2 mt-3 ml-2 animate-in slide-in-from-bottom-2 flex-wrap">
      {buttons.map((button, index) => (
        <Button
          key={`${button.action}-${index}`}
          variant={index === 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onAction(button.action)}
          disabled={isProcessing}
          className={cn(
            'flex items-center gap-2',
            index === 0 && 'bg-orange-500 hover:bg-orange-600'
          )}
        >
          {button.label}
        </Button>
      ))}
    </div>
  );
};

export default MessageActions;
