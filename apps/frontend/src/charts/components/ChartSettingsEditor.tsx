import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Database, Palette, Settings, ChevronUp, ChevronDown, Sun, Moon, ChevronRight } from 'lucide-react';
import { ComponentInstance } from '@/types/components';
import ChartDataEditor from '@/components/ChartDataEditor';
import { CHART_COLOR_PALETTES } from '@/config/chartColors';
import GradientPicker from '@/components/GradientPicker';
import { Button } from '@/components/ui/button';
import { ChartType } from '@/types/ChartTypes';
import { 
  CHART_TYPE_SETTINGS, 
  CHART_TYPE_LABELS, 
  CHART_CATEGORIES,
  ChartSettingProperty 
} from '@/charts/config/chartTypeSettings';
import { FontLoadingService } from '@/services/FontLoadingService';
import { notifyChartPropertyChanged } from '@/charts/utils/ThemeUtils';
import { FONT_CATEGORIES } from '@/registry/library/fonts';
import GroupedDropdown from '@/components/settings/GroupedDropdown';

interface ChartSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  handlePropChange: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
}

const ChartSettingsEditor: React.FC<ChartSettingsEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory
}) => {
  // Get the current chart type
  const chartType = component.props.chartType as ChartType || 'bar';
  
  // Get settings configuration for current chart type
  const chartConfig = CHART_TYPE_SETTINGS[chartType] || CHART_TYPE_SETTINGS.bar;
  
  // State to control collapsible sections
  const [isChartDataOpen, setIsChartDataOpen] = React.useState(false);

  // Helper for creating transparency background pattern
  const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;
  
  // Function to open chart data section
  const openChartDataSection = () => {
    if (isChartDataOpen) {
      setTimeout(() => {
        const chartDataSection = document.querySelector('[data-collapsible-id="chart-data"]');
        if (chartDataSection) {
          chartDataSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }
      }, 50);
    } else {
      setIsChartDataOpen(true);
    }
  };

  // Ensure backend fonts are synced for grouped dropdowns
  const [fontGroups, setFontGroups] = React.useState<Record<string, string[]>>({});
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await FontLoadingService.syncDesignerFonts?.(); } catch {}
      if (!cancelled) {
        try { setFontGroups(FontLoadingService.getDedupedFontGroups?.() || {}); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Helper to get property configuration
  const getPropertyConfig = (propId: string): ChartSettingProperty | null => {
    const prop = chartConfig.properties[propId];
    if (!prop) return null;
    if (typeof prop === 'boolean') {
      // Default configurations for common properties
      const defaults: Record<string, ChartSettingProperty> = {
        enableLabel: { id: 'enableLabel', label: 'Labels', type: 'toggle', defaultValue: true },
        enableAxisTicks: { id: 'enableAxisTicks', label: 'Axis Ticks', type: 'toggle', defaultValue: true },
        enableGrid: { id: 'enableGrid', label: 'Grid', type: 'toggle', defaultValue: true },
        showAxisLegends: { id: 'showAxisLegends', label: 'Axis Titles', type: 'toggle', defaultValue: true },
        showLegend: { id: 'showLegend', label: 'Legend', type: 'toggle', defaultValue: false },
        animate: { id: 'animate', label: 'Animation', type: 'toggle', defaultValue: true },
        smoothCurve: { id: 'smoothCurve', label: 'Smooth Lines', type: 'toggle', defaultValue: true },
        startYAtZero: { id: 'startYAtZero', label: 'Start Y at Zero', type: 'toggle', defaultValue: false },
        borderRadius: { id: 'borderRadius', label: 'Border Radius', type: 'slider', min: 0, max: 20, step: 1, defaultValue: 3 },
        borderWidth: { id: 'borderWidth', label: 'Border Width', type: 'slider', min: 0, max: 5, step: 1, defaultValue: 0 },
        borderColor: { id: 'borderColor', label: 'Border Color', type: 'color', defaultValue: '#000000' },
        cornerRadius: { id: 'cornerRadius', label: 'Corner Radius', type: 'slider', min: 0, max: 20, step: 1, defaultValue: 0 },
        pointSize: { id: 'pointSize', label: 'Point Size', type: 'slider', min: 0, max: 20, step: 1, defaultValue: 10 },
        pointBorderWidth: { id: 'pointBorderWidth', label: 'Point Border', type: 'slider', min: 0, max: 10, step: 1, defaultValue: 3 },
        lineWidth: { id: 'lineWidth', label: 'Line Width', type: 'slider', min: 1, max: 10, step: 1, defaultValue: 3 },
        tickSpacing: { id: 'tickSpacing', label: 'X Tick Spacing', type: 'toggle', defaultValue: 1 },
        tickSpacingY: { id: 'tickSpacingY', label: 'Y Tick Spacing', type: 'toggle', defaultValue: 1 },
        tickRotation: { id: 'tickRotation', label: 'Tick Rotation', type: 'slider', min: -90, max: 90, step: 1, defaultValue: 0 },
        axisBottom: { id: 'axisBottom', label: 'Bottom Axis Label', type: 'input', defaultValue: '' },
        axisLeft: { id: 'axisLeft', label: 'Left Axis Label', type: 'input', defaultValue: '' },
        fontFamily: {
          id: 'fontFamily',
          label: 'Font Family',
          type: 'select',
          options: [
            { value: 'default', label: 'System Default' },
            // Local custom fonts
            { value: '"HK Grotesk Wide", sans-serif', label: 'HK Grotesk Wide' },
            // Popular Google Fonts
            { value: '"Inter", sans-serif', label: 'Inter' },
            { value: '"Poppins", sans-serif', label: 'Poppins' },
            { value: '"Roboto", sans-serif', label: 'Roboto' },
            { value: '"Montserrat", sans-serif', label: 'Montserrat' },
            { value: '"Open Sans", sans-serif', label: 'Open Sans' },
            { value: '"Lato", sans-serif', label: 'Lato' },
            { value: '"Raleway", sans-serif', label: 'Raleway' },
            { value: '"Outfit", sans-serif', label: 'Outfit' },
            { value: '"DM Sans", sans-serif', label: 'DM Sans' },
            // Serif fonts
            { value: '"Playfair Display", serif', label: 'Playfair Display' },
            { value: '"Merriweather", serif', label: 'Merriweather' },
            { value: '"Lora", serif', label: 'Lora' },
            { value: '"Georgia", serif', label: 'Georgia' },
            // Display fonts
            { value: '"Bebas Neue", sans-serif', label: 'Bebas Neue' },
            { value: '"Righteous", sans-serif', label: 'Righteous' },
            // Modern Fontshare fonts
            { value: '"Satoshi", sans-serif', label: 'Satoshi' },
            { value: '"Cabinet Grotesk", sans-serif', label: 'Cabinet Grotesk' },
            { value: '"General Sans", sans-serif', label: 'General Sans' },
            // Monospace
            { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
            { value: '"Fira Code", monospace', label: 'Fira Code' },
            { value: '"Roboto Mono", monospace', label: 'Roboto Mono' }
          ],
          defaultValue: 'default'
        }
      };
      return defaults[propId] || null;
    }
    return prop as ChartSettingProperty;
  };

  // Render a property control based on its type
  const renderPropertyControl = (propConfig: ChartSettingProperty) => {
    const value = component.props[propConfig.id] ?? propConfig.defaultValue;
    
    switch (propConfig.type) {
      case 'toggle':
        return (
          <div className="flex items-center justify-between space-x-1">
            <span className="text-xs text-muted-foreground">{propConfig.label}</span>
            <Switch 
              checked={value}
              onCheckedChange={checked => {
                if (propConfig.id === 'smoothCurve') {
                  saveComponentToHistory("Before changing line style");
                }
                if (propConfig.id === 'startYAtZero') {
                  saveComponentToHistory("Before changing Y axis scaling");
                }
                handlePropChange(propConfig.id, checked);
              }}
              className="data-[state=checked]:bg-primary scale-75" 
            />
          </div>
        );
      
      case 'slider':
        return (
          <div className="space-y-1">
            <Label className="text-xs">{propConfig.label}</Label>
            <div className="flex items-center">
              <Slider 
                min={propConfig.min || 0} 
                max={propConfig.max || 100} 
                step={propConfig.step || 1} 
                value={[value]} 
                onValueChange={values => handlePropChange(propConfig.id, values[0], true)}
                onPointerDown={() => saveComponentToHistory(`Saved initial ${propConfig.label.toLowerCase()}`)}
                className="flex-grow" 
              />
              <span className="text-xs ml-2 w-6 text-right">
                {propConfig.id === 'innerRadius' ? `${Math.round(value * 100)}%` : value}{propConfig.id.includes('Radius') && propConfig.id !== 'innerRadius' ? '%' : propConfig.id.includes('Rotation') ? '°' : ''}
              </span>
            </div>
          </div>
        );
      
      case 'input':
        return (
          <div className="space-y-1">
            <Label className="text-xs">{propConfig.label}</Label>
            <Input 
              type="text" 
              value={value || ''} 
              onChange={e => handlePropChange(propConfig.id, e.target.value)}
              className="h-7 text-xs" 
              placeholder={`Enter ${propConfig.label.toLowerCase()}`}
            />
          </div>
        );
      
      case 'select':
        // Special handling for font family
        if (propConfig.id === 'fontFamily') {
          return (
            <div className="space-y-1">
              <Label className="text-xs">{propConfig.label}</Label>
              <GroupedDropdown
                value={value === 'default' ? 'Inter' : value || 'Inter'}
                options={[]}
                groups={Object.keys(fontGroups).length ? fontGroups : Object.fromEntries(
                  Object.entries(FONT_CATEGORIES).map(([category, fonts]) => 
                    [category, fonts.map(font => font.name)]
                  )
                )}
                onChange={async (fontName) => {
                  // Load the font first
                  try {
                    await FontLoadingService.syncDesignerFonts?.();
                    await FontLoadingService.loadFonts([fontName]);
                  } catch (error) {
                    console.error('Failed to load font:', fontName, error);
                  }
                  
                  handlePropChange(propConfig.id, fontName, true);
                  // Notify chart system of property change
                  notifyChartPropertyChanged(component.id, propConfig.id);
                }}
                placeholder="Select font"
              />
            </div>
          );
        }
        
        // Regular select for other properties
        return (
          <div className="space-y-1">
            <Label className="text-xs">{propConfig.label}</Label>
            <Select value={value} onValueChange={async (val) => {
              handlePropChange(propConfig.id, val, true);
              // Notify chart system of property change for animations
              notifyChartPropertyChanged(component.id, propConfig.id);
            }}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {propConfig.options?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'color':
        return (
          <div className="flex items-center justify-between">
            <Label className="text-xs">{propConfig.label}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <div
                  className="w-6 h-6 rounded border cursor-pointer"
                  style={{
                    backgroundImage: getTransparencyPattern(),
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                  }}
                  onClick={() => saveComponentToHistory(`Saved initial ${propConfig.label.toLowerCase()}`)}
                >
                  <div
                    className="w-full h-full rounded-sm"
                    style={{ backgroundColor: value }}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="p-0" onClick={e => e.stopPropagation()}>
                <div onClick={e => e.stopPropagation()} className="p-2">
                  <GradientPicker
                    value={value}
                    onChange={val => handlePropChange(propConfig.id, val, true)}
                    onChangeComplete={() => saveComponentToHistory(`Saved final ${propConfig.label.toLowerCase()}`)}
                    initialTab="solid"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Chart Type Selector */}
      <div className="space-y-2">
        <Label className="text-xs">Chart Type</Label>
        <Select 
          value={chartType} 
          onValueChange={value => handlePropChange('chartType', value)}
        >
          <SelectTrigger className="w-full h-9 text-xs">
            <SelectValue placeholder="Select Chart Type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHART_CATEGORIES).map(([categoryId, category]) => (
              <div key={categoryId}>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {category.label}
                </div>
                {category.charts.map(type => (
                  <SelectItem key={type} value={type} className="text-xs py-2 pl-4">
                    {CHART_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Special bar chart horizontal toggle */}
      {chartType === 'bar' && chartConfig.properties.horizontalBars && (
        <div className="flex items-center justify-between space-x-2">
          <span className="text-xs text-muted-foreground">
            Horizontal bars
          </span>
          <Switch 
            checked={component.props.verticalAnimation === false}
            onCheckedChange={checked => {
              saveComponentToHistory("Before toggling animation direction");
              onUpdate({ verticalAnimation: !checked });
            }}
            className="data-[state=checked]:bg-primary scale-75" 
          />
        </div>
      )}
      
      {/* Chart Data Editor */}
      <div className="mt-2" data-collapsible-id="chart-data">
        <Collapsible open={isChartDataOpen} onOpenChange={setIsChartDataOpen}>
          <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
            <div className="flex items-center gap-1">
              <Database size={14} />
              <span className="text-xs font-medium">Chart Data</span>
            </div>
            <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1 py-1">
            <ChartDataEditor
              data={component.props.data || []}
              onChange={data => {
                const updates: Record<string, any> = { data };
                
                // Extract colors from data if present
                const colorsFromData = data
                  .map(item => item.color)
                  .filter((color): color is string => !!color);
                  
                if (colorsFromData.length > 0) {
                  updates.colors = colorsFromData;
                }
                
                onUpdate(updates);
              }}
              chartType={chartType}
              saveComponentToHistory={saveComponentToHistory}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
      
      {/* Chart Design */}
      <div className="mt-2">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
            <div className="flex items-center gap-1">
              <Palette size={14} />
              <span className="text-xs font-medium">Chart Design</span>
            </div>
            <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1 py-1 space-y-2">
            {/* Chart Toggles */}
            <div className="grid grid-cols-2 gap-1 pb-2 border-b border-border/30">
              {['enableLabel', 'enableAxisTicks', 'enableGrid', 'showAxisLegends', 
                'startYAtZero', 'showLegend', 'smoothCurve'].map(propId => {
                const propConfig = getPropertyConfig(propId);
                if (!propConfig || !chartConfig.properties[propId]) return null;
                return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
              })}
            </div>

            {/* Animation Settings */}
            {chartConfig.sections.animation && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Animation</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['animate'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Typography Settings */}
            {chartConfig.sections.typography && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Typography</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['fontFamily'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Colors Section */}
            {chartConfig.sections.colors && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Colors</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Theme</Label>
                    <div className="flex items-center gap-1 px-2 py-1 bg-secondary/30 rounded-md">
                      <Sun size={12} className={component.props.theme === 'light' ? 'text-primary' : 'text-muted-foreground'} />
                      <Switch 
                        checked={component.props.theme === 'dark'}
                        onCheckedChange={checked => {
                          handlePropChange('theme', checked ? 'dark' : 'light');
                          saveComponentToHistory("Changed chart theme");
                        }}
                        className="scale-[0.6] data-[state=checked]:bg-primary" 
                      />
                      <Moon size={12} className={component.props.theme === 'dark' ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                  </div>
                  
                  {/* Color Palette */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Color Palette</Label>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(CHART_COLOR_PALETTES).map(([name, colors]) => (
                        <button
                          key={name}
                          className="h-6 p-0.5 border rounded-sm overflow-hidden flex hover:border-primary cursor-pointer transition-colors"
                          onClick={() => {
                            saveComponentToHistory("Before changing color palette");
                            const newColors = [...colors];
                            
                            // Update the data items with the new colors
                            const currentData = component.props.data || [];
                            const updatedData = currentData.map((item, index) => ({
                              ...item,
                              color: colors[index % colors.length]
                            }));
                            
                            onUpdate({ 
                              colors: newColors,
                              data: updatedData
                            });
                          }}
                          style={{
                            outline:
                              component.props.colors &&
                              JSON.stringify(component.props.colors) === JSON.stringify(colors)
                                ? '2px solid var(--primary)'
                                : 'none'
                          }}
                        >
                          <span className="text-[10px] px-1 flex-shrink-0 flex items-center">{name}</span>
                          <div className="flex flex-1 min-w-0">
                            {colors.slice(0, Math.min(6, colors.length)).map((color, i) => (
                              <div
                                key={i}
                                className="h-full flex-1"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </button>
                      ))}
                      {/* Custom palette option */}
                      <button
                        className="h-6 px-2 border rounded-sm flex items-center justify-center hover:border-primary cursor-pointer text-[10px] transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTimeout(() => {
                            openChartDataSection();
                          }, 50);
                        }}
                        style={{
                          outline: 
                            component.props.colors && 
                            !Object.values(CHART_COLOR_PALETTES).some(palette => 
                              JSON.stringify(palette) === JSON.stringify(component.props.colors)
                            )
                              ? '2px solid var(--primary)'
                              : 'none'
                        }}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  
                  {/* Background color */}
                  <div className="space-y-1">
                    <Label className="text-xs">Background Color</Label>
                    {renderPropertyControl({
                      id: 'backgroundColor',
                      label: 'Background Color',
                      type: 'color',
                      defaultValue: '#00000000'
                    })}
                  </div>
                  
                  {/* Border color */}
                  {chartConfig.properties.borderColor && (
                    renderPropertyControl(getPropertyConfig('borderColor')!)
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Border Settings */}
            {chartConfig.sections.borderSettings && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Border Settings</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['borderRadius', 'cornerRadius', 'borderWidth'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Point Settings */}
            {chartConfig.sections.pointSettings && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Point Settings</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['pointSize', 'pointBorderWidth', 'lineWidth'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Pie Settings */}
            {chartConfig.sections.pieSettings && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Pie Settings</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['innerRadius', 'padAngle'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Gauge Settings */}
            {chartConfig.sections.gaugeSettings && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Gauge Settings</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {['gaugeLabel', 'minValue', 'maxValue'].map(propId => {
                    const propConfig = getPropertyConfig(propId);
                    if (!propConfig || !chartConfig.properties[propId]) return null;
                    return <div key={propId}>{renderPropertyControl(propConfig)}</div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Axis Settings */}
            {chartConfig.sections.axisSettings && (
              <Collapsible>
                <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-1.5 px-2 hover:bg-secondary/50 rounded-sm transition-colors group">
                  <span className="text-xs font-medium">Axis Settings</span>
                  <ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-2 py-2 space-y-2">
                  {/* Axis labels */}
                  {chartConfig.properties.axisBottom && (
                    <div className="space-y-1">
                      <Label className="text-xs">Bottom Axis Label</Label>
                      <Input 
                        value={component.props.axisBottom?.legend || ''}
                        onChange={e => {
                          const newAxisBottom = {
                            ...component.props.axisBottom,
                            legend: e.target.value
                          };
                          handlePropChange('axisBottom', newAxisBottom);
                        }}
                        className="w-full h-7 text-xs"
                      />
                    </div>
                  )}
                  
                  {chartConfig.properties.axisLeft && (
                    <div className="space-y-1">
                      <Label className="text-xs">Left Axis Label</Label>
                      <Input 
                        value={component.props.axisLeft?.legend || ''}
                        onChange={e => {
                          const newAxisLeft = {
                            ...component.props.axisLeft,
                            legend: e.target.value
                          };
                          handlePropChange('axisLeft', newAxisLeft);
                        }}
                        className="w-full h-7 text-xs"
                      />
                    </div>
                  )}
                  
                  {/* Tick spacing controls */}
                  {chartConfig.properties.tickSpacing && (
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">X Tick Spacing</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const current = component.props.tickSpacing || 1;
                            if (current > 1) {
                              onUpdate({ tickSpacing: current - 1 });
                            }
                          }}
                          disabled={(component.props.tickSpacing || 1) <= 1}
                        >
                          <ChevronDown size={12} />
                        </Button>
                        <span className="text-xs w-8 text-center">
                          {component.props.tickSpacing || 1}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const current = component.props.tickSpacing || 1;
                            if (current < 10) {
                              onUpdate({ tickSpacing: current + 1 });
                            }
                          }}
                          disabled={(component.props.tickSpacing || 1) >= 10}
                        >
                          <ChevronUp size={12} />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {chartConfig.properties.tickSpacingY && (
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Y Tick Spacing</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const current = component.props.tickSpacingY || 1;
                            if (current > 1) {
                              onUpdate({ tickSpacingY: current - 1 });
                            }
                          }}
                          disabled={(component.props.tickSpacingY || 1) <= 1}
                        >
                          <ChevronDown size={12} />
                        </Button>
                        <span className="text-xs w-8 text-center">
                          {component.props.tickSpacingY || 1}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const current = component.props.tickSpacingY || 1;
                            if (current < 10) {
                              onUpdate({ tickSpacingY: current + 1 });
                            }
                          }}
                          disabled={(component.props.tickSpacingY || 1) >= 10}
                        >
                          <ChevronUp size={12} />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Tick rotation */}
                  {chartConfig.properties.tickRotation && (
                    <div className="space-y-1">
                      <Label className="text-xs">Tick Rotation</Label>
                      <div className="flex items-center">
                        <Slider
                          min={-90}
                          max={90}
                          step={1}
                          value={[component.props.axisBottom?.tickRotation ?? 0]}
                          onValueChange={values => {
                            const rot = values[0];
                            const newBottom = { ...(component.props.axisBottom || {}), tickRotation: rot };
                            const newLeft = { ...(component.props.axisLeft || {}), tickRotation: rot };
                            onUpdate({ axisBottom: newBottom, axisLeft: newLeft });
                          }}
                          onPointerDown={() => saveComponentToHistory("Saved tick rotation")}
                          className="flex-grow"
                        />
                        <span className="text-xs ml-2 w-8 text-right">
                          {component.props.axisBottom?.tickRotation ?? 0}°
                        </span>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

export default ChartSettingsEditor;