
import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  trackClassName?: string;
  thumbClassName?: string;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, trackClassName, thumbClassName, ...props }, ref) => {
  // Store local value to maintain UI consistency 
  const [localValue, setLocalValue] = React.useState<number[]>(props.value || [0]);
  const [isDragging, setIsDragging] = React.useState(false);

  // Update local value when props change and we're not dragging
  React.useEffect(() => {
    if (!isDragging && props.value) {
      setLocalValue(props.value);
    }
  }, [props.value, isDragging]);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      value={localValue}
      onValueChange={(newValue) => {
        // Update local value for immediate UI feedback
        setLocalValue(newValue);
        
        // Call the parent's onValueChange handler
        if (props.onValueChange) {
          props.onValueChange(newValue);
        }
      }}
      onValueCommit={(newValue) => {
        if (props.onValueCommit) {
          props.onValueCommit(newValue);
        }
      }}
      onPointerDown={() => {
        setIsDragging(true);
      }}
      onPointerUp={() => {
        setTimeout(() => {
          setIsDragging(false);
        }, 0);
      }}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-1 w-full grow overflow-hidden rounded-full bg-secondary/50",
          trackClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SliderPrimitive.Range className="absolute h-full bg-secondary" />
      </SliderPrimitive.Track>
      {localValue.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            "block h-4 w-4 rounded-full border-2 border-primary bg-background shadow-md ring-offset-background transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            thumbClassName
          )}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </SliderPrimitive.Root>
  )
})

Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
