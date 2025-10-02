import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SlideOutline, TaggedMedia, DeckOutline, ManualChart } from '@/types/SlideTypes';
import {
  Plus, Trash2, ChevronDown, ChevronsUpDown, Check, Copy, Settings2, Pencil,
  BarChart3, LineChart, PieChart, BarChart, BarChart2, ScatterChart,
  TrendingUp, Activity, FileSpreadsheet, Table, X, GripVertical, Edit2,
  AreaChart, Loader2, Database, Network, GitBranch, Layers
} from 'lucide-react';
import { CHART_TYPES } from '@/registry/library/chart-properties';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import ChartDataTable from './ChartDataTable';
import SlideChartViewer from './SlideChartViewer';
import OutlineRichTextEditor from './OutlineRichTextEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { v4 as uuidv4 } from 'uuid';
import CitationsPanel from './CitationsPanel';

interface ManualSlideCardProps {
  slide: SlideOutline;
  index: number;
  currentOutline: DeckOutline;
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  handleSlideTitleChange: (slideId: string, title: string) => void;
  handleSlideContentChange: (slideId: string, content: string) => void;
  handleSlideReorder?: (sourceIndex: number, destinationIndex: number) => void;
  handleDeleteSlide: (slideId: string) => void;
  handleAddSlide: () => void;
  dragOverSlideId: string | null;
  setDragOverSlideId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDragStart: (slideId: string) => void;
  handleDragOver: (e: React.DragEvent, slideId: string) => void;
  handleDrop: (e: React.DragEvent, targetSlideId: string) => void;
  handleDragEnd: () => void;
  toast: (options: any) => void;
}

const getChartIcon = (chartType: string) => {
  switch (chartType) {
    case 'bar':
    case 'barChart':
      return BarChart3;
    case 'line':
    case 'lineChart':
      return LineChart;
    case 'pie':
    case 'pieChart':
      return PieChart;
    case 'area':
    case 'areaChart':
      return AreaChart;
    case 'scatter':
    case 'scatterChart':
      return ScatterChart;
    case 'column':
    case 'columnChart':
      return BarChart2;
    case 'donut':
      return PieChart;
    case 'radar':
      return Network;
    case 'funnel':
      return GitBranch;
    case 'treemap':
      return Layers;
    case 'heatmap':
      return Database;
    case 'gauge':
      return Activity;
    case 'waterfall':
      return BarChart;
    case 'trend':
    case 'trendLine':
      return TrendingUp;
    default:
      return BarChart;
  }
};

const ManualSlideCard: React.FC<ManualSlideCardProps> = ({
  slide,
  index,
  currentOutline,
  setCurrentOutline,
  handleSlideTitleChange,
  handleSlideContentChange,
  handleSlideReorder,
  handleDeleteSlide,
  handleAddSlide,
  dragOverSlideId,
  setDragOverSlideId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  toast,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(slide.title || '');
  const [selectedChartType, setSelectedChartType] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ title: string; data: any[] } | null>(null);
  // Multiple charts support
  const [charts, setCharts] = useState<ManualChart[]>(() => slide.manualCharts || []);
  const [showChartData, setShowChartData] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Update title when slide changes
  useEffect(() => {
    setEditTitle(slide.title || `Slide ${index + 1}`);
  }, [slide.title, index]);

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleTitleSave = () => {
    handleSlideTitleChange(slide.id, editTitle);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditTitle(slide.title || `Slide ${index + 1}`);
      setIsEditingTitle(false);
    }
  };

  const handleChartTypeChange = (chartType: string) => {
    setSelectedChartType(chartType);
    
    // Update the slide with the new chart type
    const updatedSlides = currentOutline.slides.map(s => 
      s.id === slide.id 
        ? { ...s, chartType, chartData: chartData || generateDefaultChartData(chartType) }
        : s
    );
    
    setCurrentOutline({
      ...currentOutline,
      slides: updatedSlides
    });
    
    // If no chart data exists, generate default data
    if (!chartData) {
      const defaultData = generateDefaultChartData(chartType);
      setChartData(defaultData);
      updateSlideChartData(defaultData);
    }
  };

  const addNewChart = (chartType: string) => {
    const chartConfig = CHART_TYPES[chartType];
    const chartName = chartConfig?.label || chartType;
    const newChart: ManualChart = {
      id: uuidv4(),
      chartType,
      title: chartName,
      data: generateDefaultChartData(chartType).data
    };
    const newCharts = [...charts, newChart];
    setCharts(newCharts);
    setSelectedChartType(chartType);
    setChartData({ title: newChart.title, data: newChart.data });
    setCurrentOutline({
      ...currentOutline,
      slides: currentOutline.slides.map(s => s.id === slide.id ? { ...s, manualCharts: newCharts } : s)
    });
  };

  const generateDefaultChartData = (chartType: string) => {
    // Generate appropriate default data based on chart type
    const chartConfig = CHART_TYPES[chartType];
    const chartName = chartConfig?.label || chartType;
    const baseData = {
      title: chartName,
      data: [
        { label: 'Category A', value: 30 },
        { label: 'Category B', value: 45 },
        { label: 'Category C', value: 25 },
      ]
    };

    if (chartType === 'lineChart' || chartType === 'areaChart') {
      return {
        ...baseData,
        data: [
          { label: 'Jan', value: 30 },
          { label: 'Feb', value: 45 },
          { label: 'Mar', value: 35 },
          { label: 'Apr', value: 50 },
          { label: 'May', value: 42 },
        ]
      };
    }

    return baseData;
  };

  const updateSlideChartData = (newData: any) => {
    const updatedSlides = currentOutline.slides.map(s => 
      s.id === slide.id 
        ? { ...s, chartData: newData }
        : s
    );
    
    setCurrentOutline({
      ...currentOutline,
      slides: updatedSlides
    });
  };

  const handleRemoveChart = () => {
    setSelectedChartType(null);
    setChartData(null);
    setShowChartData(false);
    
    const updatedSlides = currentOutline.slides.map(s => 
      s.id === slide.id 
        ? { ...s, chartType: null, chartData: null }
        : s
    );
    
    setCurrentOutline({
      ...currentOutline,
      slides: updatedSlides
    });
  };

  const onDropOnSlide = (e: React.DragEvent) => {
    handleDrop(e, slide.id);
  };

  return (
    <Card
      className={cn(
        "w-full mb-4 overflow-hidden shadow-md border-2",
        "border-[#FF4301]/40 hover:border-[#FF4301] transition-colors duration-200",
        dragOverSlideId === slide.id && "ring-2 ring-[#FF4301]"
      )}
      draggable
      onDragStart={() => handleDragStart(slide.id)}
      onDragOver={(e) => handleDragOver(e, slide.id)}
      onDrop={onDropOnSlide}
      onDragEnd={handleDragEnd}
    >
      <div id={`manual-slide-${slide.id}`} className="p-4 relative">
        {/* Header - more compact */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <GripVertical className="h-4 w-4 text-zinc-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  className="text-base font-semibold bg-transparent border-b-2 border-blue-500 outline-none flex-1 min-w-0"
                />
              ) : (
                <h3 
                  className="text-lg font-semibold cursor-pointer hover:text-blue-600 transition-colors flex-1 truncate"
                  onClick={handleTitleEdit}
                >
                  {slide.title || `Slide ${index + 1}`}
                </h3>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTitleEdit}
                className="h-8 w-8 flex-shrink-0 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteSlide(slide.id)}
              className="h-8 w-8 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator className="mb-2" />

        {/* Content Area - Dynamic Layout */}
        <div className={cn(
          "grid gap-4 min-h-[500px]",
          charts.length > 0 ? "grid-cols-[7fr_5fr]" : "grid-cols-1"
        )}>
          {/* Left Side - Text Content (60% width) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] uppercase tracking-wide font-medium text-zinc-600 dark:text-zinc-400">Content</h4>
              {!selectedChartType && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs px-3">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Add Chart
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 max-h-[500px] overflow-y-auto">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Basic</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'basic')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => addNewChart(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Advanced</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'advanced')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => addNewChart(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Specialized</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'specialized')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => addNewChart(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="h-[460px]">
              <OutlineRichTextEditor
                value={slide.content || ''}
                onChange={(content) => handleSlideContentChange(slide.id, content)}
                placeholder="Enter your slide content here..."
                editable={true}
                showToolbar={true}
                bubbleToolbar={false}
                className="h-full"
              />
            </div>
          </div>

          {/* Right Side - Data/Charts (only show if charts exist) */}
          {charts.length > 0 && (
            <div className="space-y-3">
              {/* Chart Tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                {charts.map((c) => {
                  const ActiveIcon = getChartIcon(c.chartType);
                  const isActive = selectedChartType === c.chartType && chartData?.data === c.data;
                  return (
                    <Button
                      key={c.id}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      className={cn('h-7 text-xs px-2', isActive && 'bg-blue-600 text-white')}
                      onClick={() => {
                        setSelectedChartType(c.chartType);
                        setChartData({ title: c.title, data: c.data });
                      }}
                    >
                      <ActiveIcon className="h-3 w-3 mr-1" />
                      {CHART_TYPES[c.chartType]?.label || c.chartType || 'Chart'}
                    </Button>
                  );
                })}
                {/* Add another chart */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                      <Plus className="h-3 w-3 mr-1" /> Add Chart
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 max-h-[500px] overflow-y-auto">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Basic</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'basic')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem key={key} onClick={() => addNewChart(key)} className="flex items-center gap-2 cursor-pointer">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Advanced</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'advanced')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem key={key} onClick={() => addNewChart(key)} className="flex items-center gap-2 cursor-pointer">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Specialized</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'specialized')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem key={key} onClick={() => addNewChart(key)} className="flex items-center gap-2 cursor-pointer">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Active chart editor/viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] uppercase tracking-wide font-medium text-zinc-600 dark:text-zinc-400">Data Visualization</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // remove active chart
                      const remaining = charts.filter(c => !(c.chartType === selectedChartType && c.data === chartData?.data));
                      setCharts(remaining);
                      setCurrentOutline({
                        ...currentOutline,
                        slides: currentOutline.slides.map(s => s.id === slide.id ? { ...s, manualCharts: remaining } : s)
                      });
                      if (remaining.length) {
                        const first = remaining[0];
                        setSelectedChartType(first.chartType);
                        setChartData({ title: first.title, data: first.data });
                      } else {
                        setSelectedChartType(null);
                        setChartData(null);
                      }
                    }}
                    className="h-8 text-xs px-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>

              <div className="h-[460px] space-y-2">
                {/* Chart Type Selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const Icon = getChartIcon(selectedChartType);
                          return <Icon className="h-4 w-4" />;
                        })()}
                        <span>{CHART_TYPES[selectedChartType]?.label || 'Chart'}</span>
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 max-h-[500px] overflow-y-auto">
                    {/* Basic Charts */}
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Basic</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'basic')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => handleChartTypeChange(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    
                    <DropdownMenuSeparator className="my-1" />
                    
                    {/* Advanced Charts */}
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Advanced</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'advanced')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => handleChartTypeChange(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    
                    <DropdownMenuSeparator className="my-1" />
                    
                    {/* Specialized Charts */}
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Specialized</DropdownMenuLabel>
                    {Object.entries(CHART_TYPES)
                      .filter(([_, config]) => config.category === 'specialized')
                      .map(([key, config]) => {
                        const Icon = getChartIcon(key);
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => handleChartTypeChange(key)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Chart Preview or Data Editor */}
                <div className="flex-1 overflow-hidden">
                  {showChartData ? (
                    <div className="h-full flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Edit Data</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowChartData(false)}
                          className="h-6 text-xs px-2"
                        >
                          <BarChart3 className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                      </div>
                      <div className="flex-1 overflow-auto border rounded-lg bg-white dark:bg-zinc-950">
                        <ChartDataTable
                          extractedData={{
                            source: 'manual',
                            chartType: selectedChartType || 'bar',
                            data: chartData?.data || generateDefaultChartData(selectedChartType).data,
                            title: chartData?.title || slide.title || '',
                            compatibleChartTypes: Object.keys(CHART_TYPES)
                          }}
                          onChangeExtractedData={(updated) => {
                            // update local
                            setChartData({ title: updated.title, data: updated.data });
                            // update active chart in charts array
                            const updatedCharts = charts.map(c =>
                              c.chartType === (selectedChartType || '') && c.data === chartData?.data
                                ? { ...c, title: updated.title, data: updated.data }
                                : c
                            );
                            setCharts(updatedCharts);
                            // persist on slide
                            setCurrentOutline({
                              ...currentOutline,
                              slides: currentOutline.slides.map(s => s.id === slide.id ? { ...s, manualCharts: updatedCharts } : s)
                            });
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Chart Preview</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowChartData(true)}
                          className="h-6 text-xs px-2"
                        >
                          <Table className="h-3 w-3 mr-1" />
                          Edit Data
                        </Button>
                      </div>
                      <div className="flex-1 border rounded-lg p-6 bg-zinc-50 dark:bg-zinc-900/50 overflow-hidden">
                        <SlideChartViewer
                          extractedData={{
                            chartType: selectedChartType,
                            data: chartData?.data || [],
                            title: chartData?.title || slide.title
                          }}
                        />
                      </div>
                      {slide.extractedData?.metadata?.citations && (() => {
                        // Prefer backend-provided footnotes when available
                        const providedFootnotes = (slide as any)?.footnotes as Array<{ index: number; label: string; url?: string }> | undefined;
                        const cits = slide.extractedData?.metadata?.citations || [];
                        if (providedFootnotes && providedFootnotes.length > 0) {
                          return <CitationsPanel citations={cits} editable={true} footnotes={providedFootnotes as any} />;
                        }
                        const foots: Array<{ index: number; label: string; url: string }> = [];
                        let i = 0;
                        cits.forEach((c, idx) => {
                          const baseLabel = (c.title || c.source || '').trim();
                          const label = baseLabel || `Source ${idx + 1}`;
                          const rawUrl = (c.url || '').trim();
                          if (rawUrl) {
                            let host = rawUrl;
                            try { host = new URL(rawUrl).hostname; } catch { /* ignore */ }
                            const exists = foots.find(f => {
                              try { return new URL(f.url || '').hostname === host; } catch { return (f.url || '') === rawUrl; }
                            });
                            if (!exists) foots.push({ index: ++i, label, url: rawUrl });
                          } else {
                            foots.push({ index: ++i, label, url: '' });
                          }
                        });
                        return <CitationsPanel citations={cits} editable={true} footnotes={foots} />;
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ManualSlideCard;
