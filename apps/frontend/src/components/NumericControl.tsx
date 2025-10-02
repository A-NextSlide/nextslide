import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface NumericControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onSave?: () => void;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
}

/**
 * A numeric control component with increment/decrement buttons.
 * More compact and user-friendly than sliders for some use cases.
 */
const NumericControl: React.FC<NumericControlProps> = ({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onSave,
  className = "",
  labelClassName = "",
  inputClassName = ""
}) => {
  // Handle changes while validating min/max boundaries
  const handleChange = (newValue: number) => {
    // Ensure the value is within bounds
    const boundedValue = Math.max(min, Math.min(max, newValue));
    onChange(boundedValue);
  };

  // Format value for display - avoid floating point issues
  const formatValue = (val: number) => {
    if (Number.isInteger(val)) {
      return val.toString();
    }
    
    if (step < 1) {
      // Figure out how many decimal places to show based on step
      const decimalPlaces = Math.max(
        0,
        step.toString().split('.')[1]?.length || 0
      );
      return val.toFixed(decimalPlaces);
    }
    
    return val.toString();
  };

  return (
    <div className={`flex flex-col space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className={`text-xs font-normal text-muted-foreground ${labelClassName}`}>
          {label}
        </Label>
      </div>
      
      <div className="flex items-center relative">
        <Input
          type="text"
          inputMode="decimal"
          value={formatValue(value)}
          onChange={(e) => {
            const val = e.target.value;
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              handleChange(parsed);
            }
          }}
          onBlur={() => {
            if (onSave) onSave();
          }}
          className={`h-7 text-xs py-1 px-2 text-center bg-transparent pr-5 ${inputClassName}`}
        />
        <div className="flex flex-col absolute right-1 h-full opacity-50 hover:opacity-100 transition-opacity">
          <button 
            className="h-3.5 flex items-center justify-center text-muted-foreground hover:text-primary active:text-primary transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleChange(value + step);
            }}
          >
            <svg width="8" height="4" viewBox="0 0 10 5" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 0L9.33013 5H0.669873L5 0Z" fill="currentColor"/>
            </svg>
          </button>
          <button 
            className="h-3.5 flex items-center justify-center text-muted-foreground hover:text-primary active:text-primary transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleChange(value - step);
            }}
          >
            <svg width="8" height="4" viewBox="0 0 10 5" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 5L0.669872 0L9.33013 0L5 5Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NumericControl;