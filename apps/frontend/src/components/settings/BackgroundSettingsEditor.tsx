import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import GradientPicker from '@/components/GradientPicker'; // Handles both solid and gradient
import { ComponentInstance } from '@/types/components';
import { debounce } from 'lodash-es';
import { cn } from "@/lib/utils"; // For conditional classes
// Placeholder icons (replace with actual icons e.g., from lucide-react)
import { Square, Image as ImageIcon, Grip, Upload } from 'lucide-react';
// Import Popover for the nested Pattern Color picker ONLY
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Import file upload utilities
import { createUploadHandler } from '@/utils/fileUploadUtils';
import { useToast } from '@/hooks/use-toast';

type BackgroundType = 'color' | 'gradient' | 'image' | 'pattern';

interface BackgroundSettingsEditorProps {
    component: ComponentInstance;
    onUpdate: (propUpdates: Record<string, any>) => void;
    saveComponentToHistory: (message?: string) => void;
}

// Helper to determine the active background type based on props
const getActiveBackgroundType = (props: Record<string, any>): BackgroundType => {
    // Prefer image if set
    if (props.backgroundImageUrl) return 'image';
    // Prefer gradient if a valid object/string indicates gradient
    if (props.gradient && isGradientValue(props.gradient)) return 'gradient';
    // Then pattern
    if (props.patternType) return 'pattern';
    // Finally, honor explicit backgroundType if present
    if (props.backgroundType) return props.backgroundType;
    // Default fallback
    return 'color';
};

const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
`;

const isGradientValue = (val: any): boolean => {
    // String gradients: trust CSS string
    if (typeof val === 'string') {
        return val.includes('gradient');
    }
    // Object gradients: require 2+ distinct color stops to consider it a real gradient
    if (typeof val === 'object' && val !== null && val.type && ['linear', 'radial'].includes(val.type)) {
        const rawStops = Array.isArray(val.stops) ? val.stops : (Array.isArray(val.colors) ? val.colors : []);
        if (!Array.isArray(rawStops) || rawStops.length < 2) return false; // single stop => solid
        const distinctColors = new Set(
            rawStops
              .map((s: any) => (s?.color || '').toString().trim().toLowerCase())
              .filter((c: string) => c.length > 0)
        );
        return distinctColors.size >= 2; // require at least two different colors
    }
    return false;
};

const gradientToString = (gradient: any): string => {
     if (typeof gradient === 'string') return gradient;
     if (isGradientValue(gradient)) {
         const rawStops = Array.isArray(gradient?.stops) ? gradient.stops : (Array.isArray(gradient?.colors) ? gradient.colors : []);
         if (gradient.type === 'linear') {
             const angle = gradient.angle ?? 90;
             const stops = [...rawStops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                                              .map(stop => `${stop.color} ${(typeof stop.position === 'number' ? (stop.position <= 1 ? stop.position * 100 : stop.position) : 0)}%`).join(', ');
             return `linear-gradient(${angle}deg, ${stops})`;
         } else if (gradient.type === 'radial') {
             const stops = [...rawStops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                                              .map(stop => `${stop.color} ${(typeof stop.position === 'number' ? (stop.position <= 1 ? stop.position * 100 : stop.position) : 0)}%`).join(', ');
             return `radial-gradient(circle, ${stops})`;
         }
     }
     return 'none';
 };

// Helper function (can be defined outside component if preferred)
const defaultGradientStops: GradientStop[] = [
    { color: '#FF0000FF', position: 0 },
    { color: '#0000FFFF', position: 100 }
];
const defaultGradient = { type: 'linear', angle: 90, stops: defaultGradientStops };

// Add GradientStop interface if not already defined globally
interface GradientStop {
  color: string;
  position: number;
}

const BackgroundSettingsEditor: React.FC<BackgroundSettingsEditorProps> = ({
    component,
    onUpdate,
    saveComponentToHistory
}) => {
    const props = component.props || {};
    const [activeSection, setActiveSection] = useState<BackgroundType>(() => getActiveBackgroundType(props));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();

    // Local state for inputs to allow debouncing / controlled inputs
    const [imageUrl, setImageUrl] = useState(props.backgroundImageUrl || '');
    const [imageSize, setImageSize] = useState(props.backgroundImageSize || 'cover');
    const [imageRepeat, setImageRepeat] = useState(props.backgroundImageRepeat || 'no-repeat');
    const [imageOpacity, setImageOpacity] = useState((props.backgroundImageOpacity ?? 1) * 100);

    const [patternType, setPatternType] = useState(props.patternType || 'dots');
    const [patternColor, setPatternColor] = useState(props.patternColor || '#ccccccff');
    const [patternScale, setPatternScale] = useState(props.patternScale || 5);
    const [patternOpacity, setPatternOpacity] = useState((props.patternOpacity ?? 0.5) * 100);
    const [isAnimated, setIsAnimated] = useState(props.isAnimated ?? false);
    const [animationSpeed, setAnimationSpeed] = useState(props.animationSpeed ?? 1);
    // Base color used beneath images/patterns/gradients when applicable
    const [baseColor, setBaseColor] = useState(props.backgroundColor || '#ffffff');

    // --- ADD Gradient Type/Angle State ---
    const currentGradient = props.gradient || defaultGradient;
    const [gradientType, setGradientType] = useState<'linear' | 'radial'>(currentGradient.type);
    const [gradientAngle, setGradientAngle] = useState(currentGradient.angle);
    // --- END ADD ---

    // Update local state if component props change externally
    useEffect(() => {
        // Keep the active section in sync with actual background mode so the UI reflects
        // when a gradient/image/pattern becomes active via external updates.
        const newActualType = getActiveBackgroundType(component.props);
        if (newActualType !== activeSection) {
            setActiveSection(newActualType);
        }

        setImageUrl(component.props.backgroundImageUrl || '');
        setImageSize(component.props.backgroundImageSize || 'cover');
        setImageRepeat(component.props.backgroundImageRepeat || 'no-repeat');
        setImageOpacity((component.props.backgroundImageOpacity ?? 1) * 100);
        setPatternType(component.props.patternType || null); // Use null if not set
        setPatternColor(component.props.patternColor || '#ccccccff');
        setPatternScale(component.props.patternScale || 5);
        setPatternOpacity((component.props.patternOpacity ?? 0.5) * 100);
        setIsAnimated(component.props.isAnimated ?? false);
        setAnimationSpeed(component.props.animationSpeed ?? 1);
        setBaseColor(component.props.backgroundColor || '#ffffff');
        
        // --- Update gradient type/angle state from props ---
        const newGradientProps = component.props.gradient || defaultGradient;
        setGradientType(newGradientProps.type);
        setGradientAngle(newGradientProps.angle);
        // --- END Update ---
    }, [component.props, activeSection]);

    // --- FUNCTION DEFINITIONS ---
    
    // (createUpdatePayload, debouncedUpdate, handlePropUpdate)
    const createUpdatePayload = useCallback((type: BackgroundType, specificUpdates: Record<string, any>): Record<string, any> => {
        // Use local state as fallback when specificUpdates doesn't provide the value
        const getPropValue = (prop: string, fallback: any) => specificUpdates[prop] ?? props[prop] ?? fallback;

        let payload: Record<string, any> = {
            backgroundType: type,
            isAnimated: getPropValue('isAnimated', isAnimated), // Use local state for animation
            animationSpeed: getPropValue('animationSpeed', animationSpeed),
        };

        // Always carry backgroundColor as the base layer so transparent images don't show through
        payload.backgroundColor = getPropValue('backgroundColor', baseColor || '#ffffff');
        payload.gradient = type === 'gradient' ? getPropValue('gradient', defaultGradient) : null;
        payload.backgroundImageUrl = type === 'image' ? getPropValue('backgroundImageUrl', imageUrl) : null;
        payload.backgroundImageSize = type === 'image' ? getPropValue('backgroundImageSize', imageSize) : null;
        payload.backgroundImageRepeat = type === 'image' ? getPropValue('backgroundImageRepeat', imageRepeat) : null;
        payload.backgroundImageOpacity = type === 'image' ? getPropValue('backgroundImageOpacity', imageOpacity / 100) : null;
        payload.patternType = type === 'pattern' ? getPropValue('patternType', patternType) : null;
        payload.patternColor = type === 'pattern' ? getPropValue('patternColor', patternColor) : null;
        payload.patternScale = type === 'pattern' ? getPropValue('patternScale', patternScale) : null;
        payload.patternOpacity = type === 'pattern' ? getPropValue('patternOpacity', patternOpacity / 100) : null;

        return payload;
    }, [props, imageUrl, imageSize, imageRepeat, imageOpacity, patternType, patternColor, patternScale, patternOpacity, isAnimated, animationSpeed, gradientType, gradientAngle, baseColor]); // Add all relevant state/prop dependencies
    const debouncedUpdate = useCallback(
        debounce((updates: Record<string, any>) => {
            onUpdate(updates);
            // History saving is now handled by handlePropUpdate for non-debounced changes
            // saveComponentToHistory(`Updated background ${Object.keys(updates)[0].replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        }, 500),
        [onUpdate] // Removed saveComponentToHistory dependency
    );
    const handlePropUpdate = useCallback((partialUpdate: Record<string, any>, historyMessage: string | null, debounceUpdate: boolean = false) => {
        const currentActiveType = activeSection;

        // If only saving history (empty partial update but history message exists),
        // just save history and exit. The actual update happened during onChange.
        if (Object.keys(partialUpdate).length === 0 && historyMessage) {
            const debouncedSave = debounce(() => saveComponentToHistory(historyMessage), 300);
            debouncedSave();
            return; // Don't proceed to recalculate/resend payload
        }
        
        const fullPayload = createUpdatePayload(currentActiveType, partialUpdate);
        
        if (debounceUpdate) {
            debouncedUpdate(fullPayload);
            if (historyMessage) { // Save history even for debounced updates when complete
                saveComponentToHistory(historyMessage);
            }
        } else {
            onUpdate(fullPayload);
            if (historyMessage) {
                const debouncedSave = debounce(() => saveComponentToHistory(historyMessage), 300);
                debouncedSave();
            }
        }
    }, [activeSection, createUpdatePayload, debouncedUpdate, onUpdate, saveComponentToHistory]); 

    // Define handleImagePropChange first as handleFileChange needs it
    const handleImagePropChange = useCallback((propName: string, value: any) => {
        let actualValue = value;
        if (propName === 'backgroundImageUrl') setImageUrl(value);
        else if (propName === 'backgroundImageSize') setImageSize(value);
        else if (propName === 'backgroundImageRepeat') setImageRepeat(value);
        else if (propName === 'backgroundImageOpacity') {
            setImageOpacity(value);
            actualValue = value / 100; 
        }
        const partialUpdate = { [propName]: actualValue };
        const historyMsg = `Updated background image ${propName.replace('backgroundImage', '').toLowerCase()}`;
        const debounceUrl = propName === 'backgroundImageUrl';
        handlePropUpdate(partialUpdate, debounceUrl ? historyMsg : null, debounceUrl);
        if (!debounceUrl) {
            const debouncedSave = debounce(() => saveComponentToHistory(historyMsg), 300);
            debouncedSave();
        }
    }, [handlePropUpdate, saveComponentToHistory]); // Added dependencies

    // Handle file upload button click
    const handleUploadButtonClick = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []); // No dependencies needed

    // Handle file selection (Uses handleImagePropChange)
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        
        setIsUploading(true);
        
        try {
            const uploadHandler = createUploadHandler(
                (url: string) => {
                    handleImagePropChange('backgroundImageUrl', url); // Now defined
                    setIsUploading(false);
                    toast({ title: "File uploaded", description: "Background media uploaded.", variant: "default" });
                },
                (error: Error) => {
                    setIsUploading(false);
                    console.error('Error in upload callback:', error);
                    toast({ title: "Upload failed", description: `Error: ${error.message}.`, variant: "destructive" });
                }
            );
            await uploadHandler(file);
        } catch (error) {
            setIsUploading(false);
            console.error('Unexpected error in handleFileChange:', error);
            toast({ title: "Upload failed", description: "An unexpected error occurred.", variant: "destructive" });
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [handleImagePropChange, saveComponentToHistory, toast]); // Use handleImagePropChange here

    // --- END MOVED/REORDERED FUNCTION DEFINITIONS ---
    
    // --- Individual Handlers (Now defined after central handlers) ---
    const handleColorChange = (value: string) => {
        // Directly call onUpdate with minimal payload for color changes
        onUpdate({
            backgroundType: 'color',
            backgroundColor: value
        });
        // History is saved on handleColorChangeComplete
    };
    const handleColorChangeComplete = () => {
        // Pass empty object for partialUpdate, just save history
        handlePropUpdate({}, "Set background color", false);
    };
    const handleGradientChange = (value: string | object) => {
        if (typeof value === 'object' && value !== null) {
            handlePropUpdate({ gradient: value }, null, false);
        }
    };
     const handleGradientChangeComplete = () => {
        // Pass empty object for partialUpdate, just save history
        handlePropUpdate({}, "Updated gradient", false);
    };
    const handleGradientTypeChange = (newType: 'linear' | 'radial') => {
        setGradientType(newType);
        const updatedGradient = { ...currentGradient, type: newType };
        handlePropUpdate({ gradient: updatedGradient }, null, false);
    };
    const handleGradientAngleChange = (newAngle: number) => {
        const validAngle = Math.max(0, Math.min(360, newAngle));
        setGradientAngle(validAngle);
        const updatedGradient = { ...currentGradient, angle: validAngle };
        handlePropUpdate({ gradient: updatedGradient }, null, false);
    };
    const handleAnimationPropChange = (propName: 'isAnimated' | 'animationSpeed', value: any) => {
        if (propName === 'isAnimated') setIsAnimated(value);
        else if (propName === 'animationSpeed') setAnimationSpeed(value);
        handlePropUpdate({ [propName]: value }, `Updated gradient ${propName.replace(/([A-Z])/g, ' $1').toLowerCase()}`, false);
    };
    const handleBaseColorChange = (value: string) => {
        setBaseColor(value);
        // Update only the color while staying on the current active type (e.g., image)
        handlePropUpdate({ backgroundColor: value }, null, false);
    };
    const handleBaseColorChangeComplete = () => {
        handlePropUpdate({}, "Set background base color", false);
    };
    const handlePatternPropChange = (propName: string, value: any) => {
         let actualValue = value;
         if (propName === 'patternType') setPatternType(value);
         else if (propName === 'patternColor') setPatternColor(value);
         else if (propName === 'patternScale') setPatternScale(value);
         else if (propName === 'patternOpacity') {
             setPatternOpacity(value);
             actualValue = value / 100;
         }
        handlePropUpdate({ [propName]: actualValue }, `Updated background pattern ${propName.replace('pattern', '').toLowerCase()}`, false);
    };
     const handlePatternColorChangeComplete = () => {
        // Apply the same fix: Just save history.
        handlePropUpdate({}, "Set pattern color", false);
     };

    // Function to render the small preview icons (no changes needed)
     const renderPreviewIcon = (type: BackgroundType, IconComponent: React.ElementType) => {
        const style: React.CSSProperties = {};
        const currentProps = component.props || {};

        switch (type) {
            case 'color': style.backgroundColor = currentProps.backgroundColor || '#fff'; break;
            // Always show black-to-white gradient for the button preview
            case 'gradient': style.backgroundImage = 'linear-gradient(to right, black, white)'; break;
            case 'image': if (currentProps.backgroundImageUrl) { style.backgroundImage = `url(${currentProps.backgroundImageUrl})`; style.backgroundSize = 'cover'; style.backgroundPosition = 'center'; style.backgroundColor = currentProps.backgroundColor || '#e0e0e0'; } else { style.backgroundColor = '#e0e0e0'; } break;
            case 'pattern': if (currentProps.patternType) { style.backgroundColor = currentProps.patternColor || '#ccc'; /* TODO: Tiny pattern? */ } else { style.backgroundColor = '#e0e0e0'; } break;
        }
        return (
            <Button
                variant="outline"
                size="icon"
                className={cn(
                    "w-7 h-7 p-0 border relative overflow-hidden",
                     activeSection === type && "ring-2 ring-ring ring-offset-2" // Highlight based on activeSection state
                 )}
                onClick={() => {
                    // 1. Update the UI state
                    setActiveSection(type);
                    
                    // 2. Immediately update the component props to match the selected type
                    //    and clear props for other types.
                    //    Create a minimal payload for the selected type (e.g., ensure default color if switching to color)
                    let initialPayloadForType: Record<string, any> = {};
                    if (type === 'color' && !props.backgroundColor) {
                        initialPayloadForType.backgroundColor = '#ffffff'; // Default color
                    }
                    // Add similar initial defaults for gradient, image, pattern if needed
                    if (type === 'gradient' && !props.gradient) {
                       initialPayloadForType.gradient = defaultGradient;
                    }
                    if (type === 'image' && !props.backgroundImageUrl) {
                        // Maybe set a placeholder or leave null?
                    }
                    if (type === 'pattern' && !props.patternType) {
                        initialPayloadForType.patternType = 'dots'; // Default pattern
                    }

                    const updatePayload = createUpdatePayload(type, initialPayloadForType);
                    onUpdate(updatePayload); // Use immediate onUpdate here
                    saveComponentToHistory(`Set background type to ${type}`);
                }}
                aria-label={`Set background ${type}`}
            >
                <div className="absolute inset-0 rounded-sm" style={style} />
                {/* Conditionally render icon: Hide for 'color' and 'gradient' types */}
                {type !== 'color' && type !== 'gradient' && (
                    <IconComponent className="w-5 h-5 relative text-white mix-blend-difference stroke-1" />
                )}
            </Button>
        );
     };

    return (
        <div className="space-y-3"> {/* Increased spacing */}
             <Label className="text-xs font-medium">Background</Label>
             {/* Row of Icon Buttons acting as Tabs */}
             <div className="flex items-center space-x-1">
                {renderPreviewIcon('color', Square)}
                {renderPreviewIcon('gradient', Square)} {/* Pass dummy icon, it won't render */}
                {renderPreviewIcon('image', ImageIcon)}
                {renderPreviewIcon('pattern', Grip)}
             </div>

             {/* Conditionally Rendered Settings Sections */}
             <div className="pt-2 border-t border-border/50"> {/* Separator */}
                 {activeSection === 'color' && (
                     <div className="space-y-2">
                         <Label className="text-xs">Color Fill</Label>
                         {/* Render GradientPicker inline, configured for solid color */}
                         <GradientPicker
                             value={props.backgroundColor || '#ffffff'}
                             onChange={handleColorChange}
                             onChangeComplete={handleColorChangeComplete}
                             initialTab="solid" // Suggest solid tab initially
                             forceMode="solid" // <-- Add forceMode
                         />
                     </div>
                 )}

                 {activeSection === 'gradient' && (
                      // Reduced vertical spacing
                      <div className="space-y-1">
                          <Label className="text-xs">Gradient Fill</Label>
                          {/* Match the chart toggle style */}
                          <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2 py-1">
                                <Label htmlFor="animateGradient" className="text-xs">Dynamic Gradient</Label>
                                <Switch
                                   id="animateGradient"
                                   checked={isAnimated}
                                   onCheckedChange={(checked) => handleAnimationPropChange('isAnimated', checked)}
                                   className="h-4 w-6 data-[state=checked]:bg-primary [&>span]:h-3 [&>span]:w-3 [&>span]:translate-x-0 [&>span]:data-[state=checked]:translate-x-2" 
                                />
                              </div>
                           </div>
                           {/* Speed Slider appears only if animated */}
                           {isAnimated && (
                               <div className="flex items-center space-x-2 mt-1.5">
                                   <Label htmlFor="animationSpeed" className="text-xs w-10 shrink-0">Speed</Label>
                                   <Slider
                                       id="animationSpeed"
                                       min={0.1}
                                       max={3}
                                       step={0.1}
                                       value={[animationSpeed]}
                                       onValueChange={([value]) => handleAnimationPropChange('animationSpeed', value)}
                                       onValueCommit={() => saveComponentToHistory("Updated gradient animation speed")}
                                       className="flex-1"
                                   />
                                   <span className="text-xs w-8 text-right shrink-0">{animationSpeed.toFixed(1)}x</span>
                               </div>
                           )}
                          {/* Gradient Picker - Renders stops, etc. */}
                          <GradientPicker
                              value={props.gradient || defaultGradient} 
                              onChange={handleGradientChange}
                              onChangeComplete={handleGradientChangeComplete}
                              initialTab="gradient"
                              forceMode="gradient"
                          />
                          {/* No duplicate Type or Angle selectors needed - they're already in GradientPicker */}
                      </div>
                 )}

                 {activeSection === 'image' && (
                     <div className="space-y-3"> {/* More spacing for image controls */}
                         <Label className="text-xs">Image Background</Label>
                         <div className="flex items-center space-x-2">
                            <Label htmlFor="imageUrl" className="text-xs w-12 shrink-0">URL</Label>
                            <Input id="imageUrl" type="text" value={imageUrl} onChange={(e) => handleImagePropChange('backgroundImageUrl', e.target.value)} onBlur={() => saveComponentToHistory("Updated background image URL")} className="h-8 text-xs" placeholder="https://..." />
                         </div>
                         {/* Hidden file input - accepts any media file with a more explicit list */}
                         <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mp3,.wav,.ogg"
                            style={{ display: 'none' }}
                         />
                         <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-xs w-full"
                            onClick={handleUploadButtonClick}
                            disabled={isUploading}
                         >
                            {isUploading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Uploading...
                                </span>
                            ) : (
                                <span className="flex items-center">
                                    <Upload className="w-3 h-3 mr-2" />
                                    Upload Media
                                </span>
                            )}
                         </Button>
                         <div className="flex items-center space-x-2">
                            <Label htmlFor="imageSize" className="text-xs w-12 shrink-0">Size</Label>
                            <Select value={imageSize} onValueChange={(value) => handleImagePropChange('backgroundImageSize', value)}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cover">Cover</SelectItem>
                                    <SelectItem value="contain">Contain</SelectItem>
                                    <SelectItem value="auto">Auto</SelectItem>
                                </SelectContent>
                            </Select>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Label htmlFor="imageRepeat" className="text-xs w-12 shrink-0">Repeat</Label>
                             <Select value={imageRepeat} onValueChange={(value) => handleImagePropChange('backgroundImageRepeat', value)}>
                                 <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                                 <SelectContent>
                                     <SelectItem value="no-repeat">No Repeat</SelectItem>
                                    <SelectItem value="repeat">Repeat</SelectItem>
                                    <SelectItem value="repeat-x">Repeat X</SelectItem>
                                    <SelectItem value="repeat-y">Repeat Y</SelectItem>
                                 </SelectContent>
                             </Select>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Label htmlFor="imageOpacity" className="text-xs w-12 shrink-0">Opacity</Label>
                             <Slider id="imageOpacity" min={0} max={100} step={1} value={[imageOpacity]} onValueChange={([value]) => handleImagePropChange('backgroundImageOpacity', value)} onValueCommit={() => saveComponentToHistory("Updated background image opacity")} className="flex-1" />
                             <span className="text-xs w-8 text-right shrink-0">{Math.round(imageOpacity)}%</span>
                         </div>
                         {/* Base color shown under transparent regions */}
                         <div className="flex items-center space-x-2">
                             <Label className="text-xs w-12 shrink-0">Base</Label>
                             <Popover>
                                 <PopoverTrigger asChild>
                                     <Button variant="outline" size="sm" className="h-8 flex-1 justify-start text-left font-normal">
                                         <div className="w-4 h-4 rounded border mr-2 shrink-0" style={{backgroundColor: baseColor}}></div>
                                         <span className='truncate'>{baseColor}</span>
                                     </Button>
                                 </PopoverTrigger>
                                 <PopoverContent className="w-72 p-0">
                                     <GradientPicker
                                         value={baseColor}
                                         onChange={handleBaseColorChange}
                                         onChangeComplete={handleBaseColorChangeComplete}
                                         initialTab="solid"
                                         forceMode="solid"
                                     />
                                 </PopoverContent>
                             </Popover>
                         </div>
                     </div>
                 )}

                 {activeSection === 'pattern' && (
                     <div className="space-y-3"> {/* More spacing for pattern controls */}
                         <Label className="text-xs">Pattern Background</Label>
                         <div className="flex items-center space-x-2">
                             <Label htmlFor="patternType" className="text-xs w-12 shrink-0">Type</Label>
                            <Select value={patternType || ''} onValueChange={(value) => handlePatternPropChange('patternType', value || null)}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dots">Dots</SelectItem>
                                    <SelectItem value="lines">Lines</SelectItem>
                                    <SelectItem value="checkered">Checkered</SelectItem>
                                    <SelectItem value="grid">Grid</SelectItem>
                                    {/* Add value="" for None? -> Changed to "none" */}
                                    <SelectItem value="none">None</SelectItem>
                                </SelectContent>
                            </Select>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Label className="text-xs w-12 shrink-0">Color</Label>
                             {/* Keep Popover for nested color picker */}
                             <Popover>
                                <PopoverTrigger asChild>
                                     <Button variant="outline" size="sm" className="h-8 flex-1 justify-start text-left font-normal">
                                         <div className="w-4 h-4 rounded border mr-2 shrink-0" style={{backgroundColor: patternColor}}></div>
                                         <span className='truncate'>{patternColor}</span>
                                     </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-0">
                                    <GradientPicker
                                        value={patternColor}
                                        onChange={(value) => handlePatternPropChange('patternColor', value)}
                                        onChangeComplete={handlePatternColorChangeComplete}
                                        initialTab="solid" // Start solid for pattern color
                                        forceMode="solid" // <-- Also force solid mode for pattern color picker
                                    />
                                </PopoverContent>
                             </Popover>
                         </div>
                         <div className="flex items-center space-x-2">
                            <Label htmlFor="patternScale" className="text-xs w-12 shrink-0">Scale</Label>
                            <Slider id="patternScale" min={1} max={20} step={1} value={[patternScale]} onValueChange={([value]) => handlePatternPropChange('patternScale', value)} onValueCommit={() => saveComponentToHistory("Updated background pattern scale")} className="flex-1" />
                            <span className="text-xs w-8 text-right shrink-0">{patternScale}</span>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Label htmlFor="patternOpacity" className="text-xs w-12 shrink-0">Opacity</Label>
                             <Slider id="patternOpacity" min={0} max={100} step={1} value={[patternOpacity]} onValueChange={([value]) => handlePatternPropChange('patternOpacity', value)} onValueCommit={() => saveComponentToHistory("Updated background pattern opacity")} className="flex-1" />
                             <span className="text-xs w-8 text-right shrink-0">{Math.round(patternOpacity)}%</span>
                         </div>
                     </div>
                 )}
             </div>
        </div>
    );
};

export default BackgroundSettingsEditor;