"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

interface EditableDropdownProps {
  value: string | number;
  options: string[];
  onChange: (value: string | number) => void;
  placeholder?: string;
  // label?: string; // Label removed
  type?: 'string' | 'number';
  propName?: string; // To identify font family for styling
  className?: string;
  icon?: React.ReactNode; 
}

const EditableDropdown: React.FC<EditableDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = "Select...",
  // label, // Label removed
  type = 'string',
  propName,
  className,
  icon
}) => {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState<string>(String(value ?? ''))

  React.useEffect(() => {
    // Sync input value if external value changes
    setInputValue(String(value ?? ''))
  }, [value])

  const handleSelect = (currentValue: string) => {
    const finalValue = type === 'number' ? parseFloat(currentValue) : currentValue;
    if (type === 'number' && isNaN(finalValue as number)) {
        console.warn("Invalid number input:", currentValue);
        return; 
    }
    
    setInputValue(currentValue)
    onChange(finalValue);
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
  }
  
  const handleInputBlur = () => {
     const finalValue = type === 'number' ? parseFloat(inputValue) : inputValue;
      if (String(finalValue) !== String(value)) { 
          if (type === 'number') {
              if (!isNaN(finalValue as number)) {
                onChange(finalValue);
              } else {
                  setInputValue(String(value ?? ''));
              }
          } else {
            onChange(finalValue);
          }
      }
  }
  
   const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur(); 
      e.currentTarget.blur(); 
    }
  }

  const displayValue = String(value ?? '');
  const isFontFamily = propName === 'fontFamily';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Label removed */}
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full h-8 text-xs px-1 font-normal grid grid-cols-[1fr_auto] items-center gap-2", className)}
          style={isFontFamily ? { fontFamily: displayValue } : undefined}
        >
          <div className="flex items-center gap-1 overflow-hidden min-w-0">
            {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
            <span>{displayValue || placeholder}</span>
          </div>
          <ChevronsUpDown className="h-1.5 w-1.5 shrink-0 opacity-50 justify-self-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] p-0" 
        align="start" 
      >
        <ScrollArea className="h-[220px]">
           <div className="p-1">
              <Input 
                 value={inputValue}
                 onChange={handleInputChange}
                 onBlur={handleInputBlur}
                 onKeyDown={handleInputKeyDown}
                 className="h-8 text-xs w-full mb-1"
                 placeholder={placeholder}
              />
            </div>
            <div className="px-1 pb-1">
              {options.length > 0 ? (
                options.map((option) => (
                  <div
                    key={option}
                    onClick={() => handleSelect(option)}
                    className="text-xs py-1.5 px-2 rounded-sm hover:bg-accent cursor-pointer flex items-center"
                    style={isFontFamily ? { fontFamily: option } : undefined}
                  >
                    <Check
                        className={cn(
                        "mr-2 h-3 w-3",
                        String(value) === option ? "opacity-100" : "opacity-0"
                        )}
                    />
                    <span style={isFontFamily ? { fontFamily: option } : undefined}>{option}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2">No options available.</div>
              )}
            </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default EditableDropdown; 