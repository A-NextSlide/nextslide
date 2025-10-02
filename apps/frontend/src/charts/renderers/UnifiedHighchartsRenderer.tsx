import React, { useMemo } from 'react';
import { HighchartsChartFrame } from './HighchartsChartFrame';
import { SSRHighcharts } from '../utils/highchartsSSR';
import { BaseChartProps, ChartType, ChartDataPoint, ChartSeries } from '@/types/ChartTypes';
import { transformChartData, getDefaultData } from '@/types/DataTransformers';
import { 
  convertBarPieData, 
  convertSeriesData, 
  convertHeatmapData, 
  convertBumpData 
} from '../utils/highchartsUtils';
import { RendererProps } from '@/renderers/index';
import { getChartTypeDefaults } from '@/registry/utils';
import Highcharts from 'highcharts';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { calculateDynamicTickSettings } from '@/charts/utils/ChartUtils';

/**
 * Get chart-type specific Highcharts options
 */
function getChartSpecificOptions(
  chartType: ChartType,
  props: BaseChartProps & Record<string, any>
): Partial<Highcharts.Options> {
  const baseOptions: Partial<Highcharts.Options> = {
    responsive: {
      rules: []
    }
  };
  
  // Get theme color for data labels
  const theme = props.theme || 'light';
  const dataLabelColor = theme === 'dark' ? '#e0e0e0' : '#333333';

  switch (chartType) {
    case 'bar':
      const barPlotOptions: any = {
        bar: {
          borderRadius: props.borderRadius || 3,
          borderWidth: props.borderWidth || 0,
          borderColor: props.borderColor || 'transparent',
          dataLabels: {
            enabled: props.enableLabel,
            style: { 
              fontSize: '11px', 
              fontWeight: 'normal',
              color: dataLabelColor
            }
          }
        },
        column: {
          borderRadius: props.borderRadius || 3,
          borderWidth: props.borderWidth || 0,
          borderColor: props.borderColor || 'transparent',
          dataLabels: {
            enabled: props.enableLabel,
            style: { 
              fontSize: '11px', 
              fontWeight: 'normal',
              color: dataLabelColor
            }
          }
        }
      };
      
      // Add animation configuration
      if (props.animate !== false) {
        barPlotOptions.series = {
          animation: true
        };
      } else {
        barPlotOptions.series = {
          animation: false
        };
      }
      
      return {
        ...baseOptions,
        chart: {
          type: props.horizontalBars ? 'bar' : 'column',
          animation: props.animate !== false
        },
        plotOptions: barPlotOptions
      };

    case 'column':
      // Use the same configuration as bar charts
      return getChartSpecificOptions('bar', props);

    case 'pie':
      return {
        ...baseOptions,
        plotOptions: {
          pie: {
            innerSize: props.innerRadius ? `${props.innerRadius * 100}%` : '0%',
            borderWidth: props.borderWidth || 0,
            borderColor: props.borderColor || '#ffffff',
            dataLabels: {
              enabled: props.enableArcLinkLabels !== false,
              distance: props.enableArcLinkLabels ? 30 : -30,
              style: { 
                fontSize: '11px',
                color: dataLabelColor
              }
            },
            showInLegend: props.showLegend
          }
        }
      };

    case 'line':
    case 'spline':
      return {
        ...baseOptions,
        chart: {
          type: chartType
        },
        plotOptions: {
          line: {
            marker: {
              enabled: true,
              radius: props.pointSize || 3,
              lineWidth: props.pointBorderWidth || 1,
              lineColor: null // Use series color
            },
            lineWidth: props.lineWidth || 3,
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          },
          spline: {
            marker: {
              enabled: true,
              radius: props.pointSize || 3,
              lineWidth: props.pointBorderWidth || 1,
              lineColor: null
            },
            lineWidth: props.lineWidth || 3,
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'area':
    case 'areaspline':
      return {
        ...baseOptions,
        chart: {
          type: chartType
        },
        plotOptions: {
          area: {
            marker: {
              enabled: false,
              radius: props.pointSize || 3
            },
            lineWidth: props.lineWidth || 2,
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          },
          areaspline: {
            marker: {
              enabled: false,
              radius: props.pointSize || 3
            },
            lineWidth: props.lineWidth || 2,
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'scatter':
      return {
        ...baseOptions,
        plotOptions: {
          scatter: {
            marker: {
              radius: props.pointSize || 6,
              states: {
                hover: {
                  enabled: true,
                  lineColor: 'rgb(100,100,100)'
                }
              }
            },
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'bubble':
      return {
        ...baseOptions,
        chart: {
          type: 'bubble',
          plotBorderWidth: 1,
          ...{ zoomType: 'xy' } // Use spread to bypass type checking
        } as any,
        plotOptions: {
          bubble: {
            minSize: 8,
            maxSize: 60,
            dataLabels: {
              enabled: props.enableLabel,
              format: '{point.name}',
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'radar':
      return {
        ...baseOptions,
        chart: {
          polar: true,
          type: 'line'
        },
        pane: {
          size: '80%'
        },
        xAxis: {
          categories: [], // Will be populated from data
          tickmarkPlacement: 'on',
          lineWidth: 0
        },
        yAxis: {
          gridLineInterpolation: 'polygon' as any,
          lineWidth: 0,
          min: 0
        }
      };

    case 'waterfall':
      return {
        ...baseOptions,
        chart: {
          type: 'waterfall'
        },
        plotOptions: {
          waterfall: {
            lineWidth: 1,
            lineColor: '#333333',
            dashStyle: 'Dot' as any,
            borderRadius: 3,
            dataLabels: {
              enabled: props.enableLabel,
              inside: false,
              formatter: function(this: any) {
                return this.y !== 0 ? this.y : '';
              },
              style: {
                color: dataLabelColor
              }
            },
            upColor: props.colors?.[0] || '#4CAF50',
            color: props.colors?.[1] || '#F44336'
          }
        },
        xAxis: {
          type: 'category'
        },
        legend: {
          enabled: false
        }
      };

    case 'gauge':
      // Extract target value from data if available
      const gaugeData = props.data?.[0];
      const maxValue = gaugeData?.target || 100;
      
      return {
        ...baseOptions,
        chart: {
          type: 'gauge',
          plotBackgroundColor: null,
          plotBackgroundImage: null,
          plotBorderWidth: 0,
          plotShadow: false
        },
        pane: {
          startAngle: -150,
          endAngle: 150,
          background: [{
            backgroundColor: {
              linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [
                [0, '#FFF'],
                [1, '#333']
              ]
            },
            borderWidth: 0,
            outerRadius: '109%'
          }, {
            backgroundColor: {
              linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [
                [0, '#333'],
                [1, '#FFF']
              ]
            },
            borderWidth: 1,
            outerRadius: '107%'
          }, {
            // default background
          }, {
            backgroundColor: '#DDD',
            borderWidth: 0,
            outerRadius: '105%',
            innerRadius: '103%'
          }] as any
        },
        yAxis: {
          min: 0,
          max: maxValue,
          minorTickInterval: 'auto' as any,
          minorTickWidth: 1,
          minorTickLength: 10,
          minorTickPosition: 'inside',
          minorTickColor: '#666',
          tickPixelInterval: 30,
          tickWidth: 2,
          tickPosition: 'inside',
          tickLength: 10,
          tickColor: '#666',
          labels: {
            step: 2,
            rotation: 'auto' as any,
            style: {
              color: dataLabelColor
            }
          },
          title: {
            text: props.gaugeLabel || gaugeData?.label || 'Value',
            style: {
              color: dataLabelColor
            }
          },
          plotBands: [{
            from: 0,
            to: maxValue * 0.6,
            color: '#55BF3B' // green
          }, {
            from: maxValue * 0.6,
            to: maxValue * 0.8,
            color: '#DDDF0D' // yellow
          }, {
            from: maxValue * 0.8,
            to: maxValue,
            color: '#DF5353' // red
          }]
        }
      };

    case 'boxplot':
      return {
        ...baseOptions,
        chart: {
          type: 'boxplot'
        },
        plotOptions: {
          boxplot: {
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'errorbar':
      return {
        ...baseOptions,
        chart: {
          type: 'column'
        },
        plotOptions: {
          errorbar: {
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'funnel':
    case 'pyramid':
      return {
        ...baseOptions,
        chart: {
          type: 'funnel'
        },
        plotOptions: {
          funnel: {
            neckWidth: chartType === 'pyramid' ? '0%' : '30%',
            neckHeight: chartType === 'pyramid' ? '0%' : '25%',
            reversed: chartType === 'pyramid',
            dataLabels: {
              enabled: props.enableLabel !== false,
              format: '<b>{point.name}</b> ({point.y:,.0f})',
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'heatmap':
      return {
        ...baseOptions,
        chart: {
          type: 'heatmap',
          plotBorderWidth: 1
          // Let Highcharts calculate margins automatically based on content
        },
        colorAxis: {
          min: 0,
          minColor: '#FFFFFF',
          maxColor: props.colors?.[0] || '#003366'
        },
        plotOptions: {
          heatmap: {
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'treemap':
      return {
        ...baseOptions,
        chart: {
          type: 'treemap'
        },
        plotOptions: {
          treemap: {
            layoutAlgorithm: 'squarified',
            dataLabels: {
              enabled: props.enableLabel !== false,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'sunburst':
      return {
        ...baseOptions,
        chart: {
          type: 'sunburst'
        },
        plotOptions: {
          sunburst: {
            dataLabels: {
              enabled: props.enableLabel !== false,
              rotationMode: 'auto',
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'sankey':
      return {
        ...baseOptions,
        chart: {
          type: 'sankey'
        },
        plotOptions: {
          sankey: {
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'dependencywheel':
      return {
        ...baseOptions,
        chart: {
          type: 'dependencywheel'
        },
        plotOptions: {
          dependencywheel: {
            dataLabels: {
              enabled: props.enableLabel,
              style: {
                color: dataLabelColor
              }
            }
          }
        }
      };

    case 'networkgraph':
      return {
        ...baseOptions,
        chart: {
          type: 'networkgraph'
        },
        plotOptions: {
          networkgraph: {
            keys: ['from', 'to', 'weight'],
            layoutAlgorithm: {
              enableSimulation: true,
              friction: -0.9,
              initialPositions: 'circle'
            },
            draggable: true,
            dataLabels: {
              enabled: props.enableLabel !== false,
              linkFormat: '',
              style: {
                fontSize: '0.8em',
                textOutline: '1px contrast',
                color: props.theme === 'dark' ? '#e0e0e0' : '#333333'
              }
            },
            link: {
              color: 'rgba(100, 100, 100, 0.5)'
            }
          }
        }
      };

    case 'packedbubble':
      return {
        ...baseOptions,
        chart: {
          type: 'packedbubble'
        },
        plotOptions: {
          packedbubble: {
            minSize: '20%',
            maxSize: '100%',
            ...{ zMin: 0, zMax: 1000 }, // Use spread to bypass type checking
            layoutAlgorithm: {
              gravitationalConstant: 0.02,
              splitSeries: true,
              seriesInteraction: false, // Prevent series from pushing each other
              initialPositions: 'circle', // Start bubbles in a circle formation from center
              initialPositionRadius: 100 // Radius for initial circle
            },
            dataLabels: {
              enabled: props.enableLabel !== false,
              format: '{point.name}',
              style: {
                color: dataLabelColor,
                textOutline: 'none',
                fontWeight: 'normal'
              }
            }
          } as any
        }
      };

    case 'streamgraph':
      return {
        ...baseOptions,
        chart: {
          type: 'streamgraph',
          ...{ zoomType: 'x' } // Use spread to bypass type checking
          // Let Highcharts calculate margins automatically based on content
        } as any,
        plotOptions: {
          series: {
            label: {
              minFontSize: 5,
              maxFontSize: 15,
              style: {
                color: 'rgba(255,255,255,0.75)'
              }
            }
          }
        }
      };

    case 'wordcloud':
      return {
        ...baseOptions,
        chart: {
          type: 'wordcloud'
        },
        plotOptions: {
          wordcloud: {
            rotation: {
              from: -60,
              to: 60,
              orientations: 5
            },
            style: {
              fontFamily: 'sans-serif'
            }
          }
        }
      };

    default:
      return baseOptions;
  }
}

/**
 * Convert data to Highcharts format based on chart type
 */
function convertDataForHighcharts(
  data: any,
  chartType: ChartType,
  colors?: string[]
): Highcharts.SeriesOptionsType[] {
  // Handle special chart types that have unique data structures
  if (['treemap', 'sunburst', 'sankey', 'dependencywheel', 'networkgraph', 'packedbubble', 'wordcloud'].includes(chartType)) {
    // These charts have special data formats
    if (Array.isArray(data) && data.length > 0) {
      // For networkgraph and dependencywheel, data should be array format
      if (chartType === 'networkgraph' || chartType === 'dependencywheel') {
        // Handle data that might come in different formats
        let dataToConvert = data;
        
        // If data is wrapped in a single series object
        if (data.length === 1 && data[0]?.data) {
          dataToConvert = data[0].data;
        }
        
        // Ensure dataToConvert is valid
        if (!dataToConvert || !Array.isArray(dataToConvert)) {
          dataToConvert = [];
        }
        
        // Check if data is already in the correct format (array of arrays)
        const firstData = dataToConvert?.[0];
        if (Array.isArray(firstData) && firstData.length >= 2) {
          // Ensure all arrays have weight value for dependency wheel
          if (chartType === 'dependencywheel') {
            dataToConvert = dataToConvert.map((item: any[]) => {
              if (item.length === 2) {
                return [...item, 1]; // Add default weight of 1
              }
              return item;
            });
          }
          
          const series: any = {
            type: chartType as any,
            name: data[0]?.id || data[0]?.name || 'Network',
            data: dataToConvert,
            keys: ['from', 'to', 'weight']
          };
          
          // Add nodes for networkgraph only
          if (chartType === 'networkgraph') {
            const nodes = new Set<string>();
            dataToConvert.forEach(([from, to]: string[]) => {
              if (from) nodes.add(from);
              if (to) nodes.add(to);
            });
            series.nodes = Array.from(nodes).map(id => ({ 
              id,
              dataLabels: {
                enabled: true
              },
              marker: {
                radius: 15
              }
            }));
          }
          
          return [series];
        }
        
        // Convert from object format to array format
        const convertedData = dataToConvert.map((item: any) => {
          if (Array.isArray(item)) {
            return item;
          }
          // Handle object format with from/to/value properties
          return [
            item.from || item.source || item.name || '', 
            item.to || item.target || '', 
            item.weight || item.value || 1
          ];
        }).filter(item => item[0] && item[1]); // Filter out invalid entries
        
        // Ensure we have valid data before returning
        if (convertedData.length === 0) {
          // Return a minimal valid network graph structure
          const series: any = {
            type: chartType as any,
            name: data[0]?.id || data[0]?.name || 'Network',
            data: [['Node1', 'Node2', 1]], // Minimal data to prevent errors
            keys: ['from', 'to', 'weight']
          };
          
          if (chartType === 'networkgraph') {
            series.nodes = [{id: 'Node1'}, {id: 'Node2'}];
          }
          
          return [series];
        }
        
        const series: any = {
          type: chartType as any,
          name: data[0]?.id || data[0]?.name || 'Network',
          data: convertedData,
          keys: ['from', 'to', 'weight']
        };
        
        // Add nodes for networkgraph only
        if (chartType === 'networkgraph') {
          const nodes = new Set<string>();
          convertedData.forEach(([from, to]) => {
            if (from) nodes.add(from);
            if (to) nodes.add(to);
          });
          // Create a stable nodes array
          const nodeArray = Array.from(nodes).map(id => ({ 
            id,
            marker: { radius: 15 },
            dataLabels: {
              enabled: true
            }
          }));
          series.nodes = nodeArray;
          // Also add layoutAlgorithm settings to the series
          series.layoutAlgorithm = {
            enableSimulation: true,
            friction: -0.9,
            initialPositions: 'circle'
          };
        }
        
        return [series];
      }
      
      // For sankey
      if (chartType === 'sankey') {
        // Handle data that might come in different formats
        let sankeyData = data[0]?.data || [];
        
        // Convert object format to array format if needed
        if (sankeyData.length > 0 && !Array.isArray(sankeyData[0])) {
          sankeyData = sankeyData.map((item: any) => [
            item.from || item.source || '',
            item.to || item.target || '',
            item.weight || item.value || 1
          ]);
        }
        
        return [{
          type: 'sankey' as any,
          name: data[0]?.id || data[0]?.name || 'Flow',
          data: sankeyData,
          keys: ['from', 'to', 'weight']
        }];
      }
      
      // For treemap, sunburst
      if (chartType === 'treemap' || chartType === 'sunburst') {
        return [{
          type: chartType as any,
          name: data[0]?.id || data[0]?.name || 'Series',
          data: data[0]?.data || [],
          colorByPoint: true
        }];
      }
      
      // For packedbubble
      if (chartType === 'packedbubble') {
        return data.map((series: any, index: number) => ({
          type: 'packedbubble' as any,
          name: series.id || series.name || `Group ${index + 1}`,
          data: series.data
        }));
      }
      
      // For wordcloud
      if (chartType === 'wordcloud') {
        // Transform data to have 'weight' instead of 'value'
        const wordcloudData = data[0]?.data?.map((item: any) => ({
          name: item.name,
          weight: item.weight || item.value || 0
        })) || [];
        
        return [{
          type: 'wordcloud' as any,
          name: data[0]?.id || 'Words',
          data: wordcloudData
        }];
      }
    }
    return [];
  }
  
  // Handle streamgraph
  if (chartType === 'streamgraph') {
    return data.map((series: any, index: number) => {
      // Convert data to array format if needed
      const convertedData = series.data?.map((point: any) => {
        if (typeof point === 'number') {
          return point;
        }
        return point.y || 0;
      }) || [];
      
      return {
        type: 'streamgraph' as any,
        name: series.id || series.name || `Series ${index + 1}`,
        data: convertedData,
        color: series.color || (colors && colors[index]) || undefined
      };
    });
  }
  
  // Handle heatmap
  if (chartType === 'heatmap') {
    // Transform heatmap data to proper format
    if (data.length > 0 && data[0].data) {
      const heatmapData: any[] = [];
      const categories = {
        x: [] as string[],
        y: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      };
      
      // Extract unique x values
      data[0].data.forEach((point: any) => {
        if (!categories.x.includes(point.x)) {
          categories.x.push(point.x);
        }
      });
      
      // Transform data
      data[0].data.forEach((point: any) => {
        const xIndex = categories.x.indexOf(point.x);
        const yIndex = point.y; // Already numeric from our transform
        heatmapData.push([xIndex, yIndex, Math.floor(Math.random() * 100)]); // Random value for demo
      });
      
      return [{
        type: 'heatmap' as any,
        name: data[0].id || 'Heatmap',
        data: heatmapData,
        borderWidth: 1,
        dataLabels: {
          enabled: true
        }
      }];
    }
  }
  
  // Handle boxplot
  if (chartType === 'boxplot') {
    // For now, return simple column data
    // In production, you'd transform to proper boxplot format
    return [{
      type: 'boxplot' as any,
      name: data[0]?.id || 'Data',
      data: data[0]?.data?.map((d: any) => [d.y - 20, d.y - 10, d.y, d.y + 10, d.y + 20]) || []
    }];
  }
  
  // Handle waterfall
  if (chartType === 'waterfall') {
    // Transform waterfall data to proper format
    const waterfallData = data[0]?.data?.map((point: any) => {
      // Check if this is a special type (start, end, subtotal)
      if (point.type === 'start' || point.type === 'end') {
        return {
          name: point.name || point.x,
          y: point.value || point.y || 0,
          isSum: true
        };
      } else if (point.type === 'positive' || point.type === 'negative') {
        return {
          name: point.name || point.x,
          y: point.value || point.y || 0
        };
      } else {
        // Default behavior - positive if > 0, negative if < 0
        return {
          name: point.name || point.x,
          y: point.value || point.y || 0
        };
      }
    }) || [];
    
    return [{
      type: 'waterfall' as any,
      name: data[0]?.id || 'Waterfall',
      data: waterfallData,
      color: data[0]?.color
    }];
  }
  
  // Handle errorbar
  if (chartType === 'errorbar') {
    // Create error bar data with low/high values
    const errorBarData = data[0]?.data?.map((point: any) => ({
      low: point.y - 10,
      high: point.y + 10
    })) || [];
    
    return [{
      type: 'errorbar' as any,
      name: 'Error Range',
      data: errorBarData
    }, {
      type: 'column' as any,
      name: data[0]?.id || 'Values',
      data: data[0]?.data?.map((point: any) => point.y) || []
    }];
  }
  
  // Handle regular chart types
  switch (chartType) {
    case 'bar':
    case 'column':
    case 'pie':
    case 'gauge':
      return convertBarPieData(data as ChartDataPoint[], chartType, colors);
    
    case 'funnel':
    case 'pyramid':
      // Funnel and pyramid need specific handling
      const funnelData = (data as ChartDataPoint[]).map(d => ({
        name: d.name || d.id,
        y: typeof d.value === 'number' ? d.value : parseFloat(String(d.value)) || 0
      }));
      return [{
        type: 'funnel' as any,
        name: data[0]?.id || chartType === 'pyramid' ? 'Pyramid' : 'Funnel',
        data: funnelData
      }];
    
    case 'line':
    case 'spline':
    case 'area':
    case 'areaspline':
    case 'scatter':
    case 'bubble':
    case 'radar':
      return convertSeriesData(data as ChartSeries[], chartType, colors);
    
    default:
      return [];
  }
}

interface UnifiedHighchartsRendererProps extends RendererProps {
  animate?: boolean;
  [key: string]: any; // Allow other props to be passed through
}

/**
 * Unified Highcharts Renderer - handles all chart types
 */
const UnifiedHighchartsRenderer: React.FC<UnifiedHighchartsRendererProps> = ({ 
  component, 
  containerRef, 
  onUpdate,
  animate,
  ...otherProps 
}) => {
  // Get chart type from props
  const chartType = (component.props.chartType as ChartType) || 'bar';
  
  // For network graphs, track position changes to force recreation
  const [recreateKey, setRecreateKey] = React.useState(0);
  const lastPositionRef = React.useRef({ x: component.props.x, y: component.props.y });
  
  React.useEffect(() => {
    if (['networkgraph', 'dependencywheel', 'sankey'].includes(chartType)) {
      const currentX = component.props.x;
      const currentY = component.props.y;
      
      if (lastPositionRef.current.x !== currentX || lastPositionRef.current.y !== currentY) {
        lastPositionRef.current = { x: currentX, y: currentY };
        setRecreateKey(prev => prev + 1);
      }
    }
  }, [component.props.x, component.props.y, chartType]);
  
  // Get default props for the chart type
  const defaultProps = useMemo(() => {
    const typeDefaults = getChartTypeDefaults(chartType);
    return {
      colors: undefined,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showLegend: false,
      showAxisLegends: true,
      theme: component.props.theme || 'light', // Use current theme instead of always defaulting to light
      animate: animate !== undefined ? animate : true, // Use passed animate prop if available
      ...typeDefaults
    };
  }, [chartType, component.props.theme]);

  // Create a modified component with the animate prop override
  const modifiedComponent = useMemo(() => ({
    ...component,
    props: {
      ...component.props,
      animate: animate !== undefined ? animate : component.props.animate
    }
  }), [component, animate]);

  return (
    <HighchartsChartFrame
      component={modifiedComponent}
      containerRef={containerRef}
      defaultProps={defaultProps}
      onUpdate={onUpdate}
      backgroundColor={component.props.backgroundColor}
    >
      {({ props, highchartsOptions, height, width, isReady }) => {
        const {
          data,
          colors,
          enableGrid,
          showLegend,
          tickSpacing,
          tickSpacingY,
          axisBottom,
          axisLeft,
        } = props;
        
        // Animate once on first ready render in view mode, or if parent requests animate
        const hasAnimatedInitialRef = React.useRef(false);
        const firstReadyAnimate = isReady && !hasAnimatedInitialRef.current && !(props as any).isEditing;
        React.useEffect(() => {
          if (firstReadyAnimate) {
            hasAnimatedInitialRef.current = true;
          }
        }, [firstReadyAnimate]);
        // Latch slide-activation animate until ready, then play once
        const [oneShotAnimate, setOneShotAnimate] = React.useState(false);
        const pendingSlideAnimateRef = React.useRef(false);
        React.useEffect(() => {
          const wantsAnimate = Boolean((props as any).animate);

          if (!wantsAnimate) {
            pendingSlideAnimateRef.current = false;
            return;
          }

          if (!isReady) {
            pendingSlideAnimateRef.current = true;
            return;
          }

          pendingSlideAnimateRef.current = false;
          setOneShotAnimate(true);
          const t = setTimeout(() => setOneShotAnimate(false), 900);
          return () => clearTimeout(t);
        }, [(props as any).animate, isReady]);
        React.useEffect(() => {
          if (isReady && pendingSlideAnimateRef.current) {
            pendingSlideAnimateRef.current = false;
            setOneShotAnimate(true);
            const t = setTimeout(() => setOneShotAnimate(false), 900);
            return () => clearTimeout(t);
          }
        }, [isReady]);

        // Allow the first-ready animation to run even if parent passed animate=false
        const effectiveAnimate = ((props as any).animate === false && !firstReadyAnimate && !oneShotAnimate)
          ? false
          : (Boolean((props as any).animate) || oneShotAnimate || firstReadyAnimate);
        // Reduce log spam: only log first computation in dev
        const loggedRef = React.useRef(false);
        if (import.meta.env.DEV && !loggedRef.current) {
          loggedRef.current = true;
          console.debug('[UnifiedChart] effectiveAnimate', { id: component.id, isReady, firstReadyAnimate, oneShotAnimate, animateProp: (props as any).animate, effectiveAnimate });
        }

        // Compute scale relative to native slide size so fonts/margins scale consistently
        const containerScale = React.useMemo(() => {
          const sx = width / DEFAULT_SLIDE_WIDTH;
          const sy = height / DEFAULT_SLIDE_HEIGHT;
          const s = Math.min(sx || 1, sy || 1);
          // Clamp to avoid extremes
          return Math.max(0.25, Math.min(s, 2));
        }, [width, height]);
        
        // Transform data to the appropriate format
        const transformedData = useMemo(() => {
          if (!data || (Array.isArray(data) && data.length === 0)) {
            return getDefaultData(chartType);
          }
          return transformChartData(data, chartType);
        }, [data, chartType]);

        // Convert data to Highcharts format
        const series = useMemo(() => 
          convertDataForHighcharts(transformedData, chartType, colors),
          [transformedData, chartType, colors]
        );

        // Extract categories for bar/column charts
        const categories = useMemo(() => {
          if ((chartType === 'bar' || chartType === 'column') && Array.isArray(transformedData)) {
            return (transformedData as ChartDataPoint[]).map(d => d.name || d.id || '');
          }
          // For radar charts, extract categories from the first series data points
          if (chartType === 'radar' && Array.isArray(transformedData) && transformedData.length > 0) {
            const firstSeries = transformedData[0];
            if (firstSeries.data && Array.isArray(firstSeries.data)) {
              return firstSeries.data.map((point: any) => point.x || point.name || '');
            }
          }
          return undefined;
        }, [transformedData, chartType]);

        // Get chart-specific options
        const chartSpecificOptions = useMemo(() => 
          getChartSpecificOptions(chartType, props),
          [chartType, props]
        );

        // Compute adaptive tick settings to avoid overlap: slant and spacing
        const adaptiveTicks = React.useMemo(() => {
          // Estimate number of x data points
          let dataPointCount = 0;
          if (Array.isArray(transformedData)) {
            if ((transformedData as any)[0]?.data && Array.isArray((transformedData as any)[0].data)) {
              dataPointCount = (transformedData as any)[0].data.length;
            } else {
              dataPointCount = (transformedData as any).length;
            }
          }
          const baseRotation = (axisBottom as any)?.tickRotation ?? 0;
          const baseSpacing = tickSpacing ?? 1;
          const baseSpacingY = tickSpacingY ?? 1;
          const avgLabelLen = 9; // heuristic
          return calculateDynamicTickSettings(
            width,
            height,
            Math.max(1, dataPointCount),
            baseSpacing,
            baseRotation,
            avgLabelLen,
            baseSpacingY
          );
        }, [transformedData, width, height, tickSpacing, tickSpacingY, axisBottom]);

        const labelFontSizePx = React.useMemo(() => {
          // Scale label font size with container; clamp between 9 and 13px
          const base = 12;
          const s = Math.min(width / DEFAULT_SLIDE_WIDTH, height / DEFAULT_SLIDE_HEIGHT);
          return Math.max(9, Math.min(13, Math.round(base * (s || 1))));
        }, [width, height]);

        // Merge all options
        const chartOptions: Highcharts.Options = useMemo(() => {
          // For network graphs, ensure series always has nodes
          let finalSeries = series;
          if (chartType === 'networkgraph' && series.length > 0) {
            finalSeries = series.map((s: any) => ({
              ...s,
              nodes: s.nodes || []
            }));
          }
          
          // Merge all options
          let baseChartOptions: Highcharts.Options = {
            ...highchartsOptions,
            ...chartSpecificOptions,
            chart: {
              ...highchartsOptions.chart,
              ...chartSpecificOptions.chart,
              backgroundColor: highchartsOptions.chart?.backgroundColor,
              plotBackgroundColor: highchartsOptions.chart?.plotBackgroundColor,
              // Ensure animation is properly configured
              animation: effectiveAnimate ? { duration: 800 } : false
            },
            plotOptions: {
              ...highchartsOptions.plotOptions,
              ...chartSpecificOptions.plotOptions,
              // Ensure series animation matches chart animation
              series: {
                ...(highchartsOptions.plotOptions?.series || {}),
                ...(chartSpecificOptions.plotOptions?.series || {}),
                animation: effectiveAnimate ? (chartSpecificOptions.plotOptions?.series?.animation || true) : false
              }
            },
            xAxis: {
              ...highchartsOptions.xAxis,
              ...chartSpecificOptions.xAxis,
              ...(categories ? { categories } : {}),
              // Respect explicit tickSpacing exactly for categorical axes (1 = show all)
              tickInterval: categories && typeof tickSpacing === 'number' && tickSpacing >= 1 ? tickSpacing : undefined,
              gridLineWidth: enableGrid ? 1 : 0,
              // Ensure labels style is preserved from theme
              labels: {
                ...(highchartsOptions.xAxis as any)?.labels,
                ...(chartSpecificOptions.xAxis as any)?.labels,
                rotation: adaptiveTicks.tickRotation,
                style: {
                  ...(highchartsOptions.xAxis as any)?.labels?.style,
                  ...(chartSpecificOptions.xAxis as any)?.labels?.style,
                  fontSize: `${labelFontSizePx}px`
                }
              },
              // Ensure title style is preserved from theme
              title: {
                ...(highchartsOptions.xAxis as any)?.title,
                ...(chartSpecificOptions.xAxis as any)?.title,
                style: {
                  ...(highchartsOptions.xAxis as any)?.title?.style,
                  ...(chartSpecificOptions.xAxis as any)?.title?.style,
                  fontSize: `${Math.max(10, labelFontSizePx + 1)}px`
                }
              }
            },
            yAxis: {
              ...highchartsOptions.yAxis,
              ...chartSpecificOptions.yAxis,
              // Do not auto-adjust Y tick spacing; leave to Highcharts defaults or explicit props
              tickInterval: undefined,
              gridLineWidth: enableGrid ? 1 : 0,
              // Ensure labels style is preserved from theme
              labels: {
                ...(highchartsOptions.yAxis as any)?.labels,
                ...(chartSpecificOptions.yAxis as any)?.labels,
                rotation: (axisLeft as any)?.tickRotation ?? 0,
                style: {
                  ...(highchartsOptions.yAxis as any)?.labels?.style,
                  ...(chartSpecificOptions.yAxis as any)?.labels?.style,
                  fontSize: `${labelFontSizePx}px`
                }
              },
              // Ensure title style is preserved from theme
              title: {
                ...(highchartsOptions.yAxis as any)?.title,
                ...(chartSpecificOptions.yAxis as any)?.title,
                style: {
                  ...(highchartsOptions.yAxis as any)?.title?.style,
                  ...(chartSpecificOptions.yAxis as any)?.title?.style,
                  fontSize: `${Math.max(10, labelFontSizePx + 1)}px`
                }
              }
            },
            legend: {
              ...highchartsOptions.legend,
              enabled: showLegend || chartType === 'pie' // Pie charts usually show legend
            },
            series: finalSeries
          };

          // Enhance tooltip with source badges if sourceIndex is present on points
          const formatTooltip = function (this: any) {
            try {
              const p = this.point || {};
              const name = p.name || this.key || '';
              const y = typeof p.y === 'number' ? p.y : (typeof p.value === 'number' ? p.value : '');
              const sourceIndex = p.sourceIndex;
              // When running within SlideChartViewer, citations are not directly available here.
              // So just render a small indicator if sourceIndex exists.
              const sourceBadge = (sourceIndex !== undefined) ? `<div style="margin-top:4px;font-size:10px;color:#6b21a8">Source #${sourceIndex + 1}</div>` : '';
              return `<div><div style="font-weight:600">${name}</div><div>${y}</div>${sourceBadge}</div>`;
            } catch {
              return undefined as any;
            }
          } as any;

          baseChartOptions.tooltip = {
            ...(baseChartOptions.tooltip || {}),
            useHTML: true,
            formatter: formatTooltip
          } as any;
          
          // Apply animation configuration
          if (props.animate !== false) {
            const animConfig = {
              duration: 800,
              easing: 'easeOutQuad'
            };
            
            baseChartOptions.plotOptions = {
              ...baseChartOptions.plotOptions,
              series: {
                ...baseChartOptions.plotOptions?.series,
                animation: {
                  duration: animConfig.duration,
                  easing: animConfig.easing
                }
              }
            };
          } else {
            // Explicitly disable animations
            baseChartOptions.plotOptions = {
              ...baseChartOptions.plotOptions,
              series: {
                ...baseChartOptions.plotOptions?.series,
                animation: false
              }
            };
          }

          // Scale default margins with container size so charts keep similar proportions
          if ((props as any).margin && baseChartOptions.chart) {
            const m = (props as any).margin as { top?: number; right?: number; bottom?: number; left?: number };
            const scaled = {
              marginTop: Math.max(0, Math.round((m.top ?? 0) * containerScale)),
              marginRight: Math.max(0, Math.round((m.right ?? 0) * containerScale)),
              marginBottom: Math.max(0, Math.round((m.bottom ?? 0) * containerScale)),
              marginLeft: Math.max(0, Math.round((m.left ?? 0) * containerScale)),
            };
            baseChartOptions = {
              ...baseChartOptions,
              chart: {
                ...baseChartOptions.chart,
                ...scaled,
              }
            } as Highcharts.Options;
          }

          // For pie charts, scale data label font sizes and distances with container size
          if (chartType === 'pie') {
            const existingPie = (baseChartOptions.plotOptions as any)?.pie || {};
            const existingDL = existingPie.dataLabels || {};
            const baseFontPx = 11;
            const scaledFontPx = Math.max(6, Math.round(baseFontPx * containerScale));
            const baseDistance = props.enableArcLinkLabels ? 30 : -30;
            const scaledDistance = Math.round(baseDistance * containerScale);
            baseChartOptions = {
              ...baseChartOptions,
              plotOptions: {
                ...baseChartOptions.plotOptions,
                pie: {
                  ...existingPie,
                  dataLabels: {
                    ...existingDL,
                    distance: scaledDistance,
                    style: {
                      ...(existingDL.style || {}),
                      fontSize: `${scaledFontPx}px`,
                    }
                  }
                }
              }
            } as Highcharts.Options;
          }
          
          return baseChartOptions;
        }, [
          highchartsOptions,
          chartSpecificOptions,
          series,
          categories,
          tickSpacing,
          tickSpacingY,
          enableGrid,
          showLegend,
          chartType,
          props.animate,
          containerScale,
          width,
          height,
          props.enableArcLinkLabels
        ]);

        return (
          <SSRHighcharts
            key={`${chartType}-${['networkgraph', 'dependencywheel', 'sankey'].includes(chartType) ? recreateKey : 0}`}
            options={chartOptions}
            width={width}
            height={height}
            chartType={chartType}
            isReady={isReady}
            theme={props.theme}
          />
        );
      }}
    </HighchartsChartFrame>
  );
};

export default UnifiedHighchartsRenderer; 
