"""
Beautiful CustomComponent Library - Complex Infographics

These are production-ready, beautiful visualizations - NOT placeholders.
Each one is a complete, styled, interactive infographic.
"""

def get_radial_progress_chart(theme_colors: dict) -> str:
    """
    Radial progress chart with multiple metrics in concentric rings.
    Beautiful for showing progress on multiple KPIs.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    secondary = theme_colors.get('secondary', '#8B5CF6')
    accent = theme_colors.get('accent', '#EC4899')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const metrics = props.metrics || [
    {{ label: 'Revenue', value: 87, target: 100, color: '{primary}' }},
    {{ label: 'Customer Satisfaction', value: 92, target: 100, color: '{secondary}' }},
    {{ label: 'Market Share', value: 65, target: 100, color: '{accent}' }}
  ];
  
  const progress = state.progress || 0;
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.02;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 30);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const centerX = 50;
  const centerY = 50;
  const baseRadius = 35;
  const ringSpacing = 8;
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
      borderRadius: '24px',
      padding: '40px'
    }}
  }},
    React.createElement('svg', {{
      viewBox: '0 0 100 100',
      style: {{ width: '100%', height: '100%', maxWidth: '500px', maxHeight: '500px' }}
    }},
      metrics.map(function(metric, i) {{
        const radius = baseRadius - (i * ringSpacing);
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (circumference * metric.value / metric.target * progress);
        
        return React.createElement('g', {{ key: i }},
          React.createElement('circle', {{
            cx: centerX,
            cy: centerY,
            r: radius,
            fill: 'none',
            stroke: '#E2E8F0',
            strokeWidth: 6
          }}),
          React.createElement('circle', {{
            cx: centerX,
            cy: centerY,
            r: radius,
            fill: 'none',
            stroke: metric.color,
            strokeWidth: 6,
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            strokeLinecap: 'round',
            transform: 'rotate(-90 ' + centerX + ' ' + centerY + ')',
            style: {{ transition: 'stroke-dashoffset 0.3s ease' }}
          }}),
          React.createElement('text', {{
            x: centerX + radius + 10,
            y: centerY + (i - metrics.length/2 + 0.5) * 6,
            fontSize: 3,
            fontWeight: '600',
            fill: metric.color
          }}, metric.label + ': ' + Math.round(metric.value * progress) + '%')
        );
      }}),
      React.createElement('text', {{
        x: centerX,
        y: centerY,
        fontSize: 8,
        fontWeight: '900',
        fill: '{primary}',
        textAnchor: 'middle',
        dominantBaseline: 'middle'
      }}, Math.round(metrics.reduce(function(sum, m) {{ return sum + m.value; }}, 0) / metrics.length * progress) + '%')
    )
  );
}}"""

def get_funnel_visualization(theme_colors: dict) -> str:
    """
    Animated funnel chart for conversion funnels, sales pipeline.
    Beautiful stacked funnel with percentages.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const stages = props.stages || [
    {{ label: 'Visitors', value: 10000, color: '{primary}' }},
    {{ label: 'Leads', value: 2500, color: '#8B5CF6' }},
    {{ label: 'Qualified', value: 1000, color: '#EC4899' }},
    {{ label: 'Customers', value: 250, color: '#10B981' }}
  ];
  
  const progress = state.progress || 0;
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.02;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 30);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const maxValue = stages[0].value;
  const formatNumber = function(num) {{
    if (num >= 1000) return (num/1000).toFixed(1) + 'K';
    return num.toString();
  }};
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Inter, sans-serif',
      padding: '60px 80px',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)'
    }}
  }},
    stages.map(function(stage, i) {{
      const widthPercent = (stage.value / maxValue) * 100 * progress;
      const conversionRate = i > 0 ? ((stage.value / stages[i-1].value) * 100).toFixed(1) : 100;
      
      return React.createElement('div', {{
        key: i,
        style: {{
          width: '100%',
          marginBottom: i < stages.length - 1 ? '20px' : '0',
          position: 'relative'
        }}
      }},
        React.createElement('div', {{
          style: {{
            width: widthPercent + '%',
            height: '80px',
            backgroundColor: stage.color,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 30px',
            transition: 'width 0.5s ease',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}
        }},
          React.createElement('div', {{
            style: {{ display: 'flex', flexDirection: 'column' }}
          }},
            React.createElement('span', {{
              style: {{ fontSize: '18px', fontWeight: '700', color: 'white' }}
            }}, stage.label),
            React.createElement('span', {{
              style: {{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}
            }}, formatNumber(Math.round(stage.value * progress)))
          ),
          i > 0 ? React.createElement('span', {{
            style: {{
              fontSize: '20px',
              fontWeight: '900',
              color: 'white',
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: '8px 16px',
              borderRadius: '8px'
            }}
          }}, conversionRate + '%') : null
        )
      );
    }})
  );
}}"""

def get_comparison_bars(theme_colors: dict) -> str:
    """
    Side-by-side comparison with animated bars.
    Perfect for before/after, competitor comparison.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#EC4899')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const leftData = props.leftData || {{ label: 'Before', metrics: [
    {{ name: 'Speed', value: 45 }},
    {{ name: 'Accuracy', value: 60 }},
    {{ name: 'Cost', value: 80 }}
  ]}};
  const rightData = props.rightData || {{ label: 'After', metrics: [
    {{ name: 'Speed', value: 95 }},
    {{ name: 'Accuracy', value: 98 }},
    {{ name: 'Cost', value: 35 }}
  ]}};
  
  const progress = state.progress || 0;
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.02;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 30);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
      padding: '40px',
      background: 'linear-gradient(to right, #FEF3F2 0%, #F0F9FF 100%)'
    }}
  }},
    React.createElement('div', {{
      style: {{ flex: 1, paddingRight: '40px' }}
    }},
      React.createElement('h3', {{
        style: {{ fontSize: '28px', fontWeight: '700', color: '#991B1B', marginBottom: '30px', textAlign: 'center' }}
      }}, leftData.label),
      leftData.metrics.map(function(metric, i) {{
        return React.createElement('div', {{ key: i, style: {{ marginBottom: '20px' }} }},
          React.createElement('div', {{
            style: {{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}
          }}, metric.name),
          React.createElement('div', {{
            style: {{ width: '100%', height: '12px', backgroundColor: '#FEE2E2', borderRadius: '6px', overflow: 'hidden' }}
          }},
            React.createElement('div', {{
              style: {{
                width: (metric.value * progress) + '%',
                height: '100%',
                backgroundColor: '#DC2626',
                transition: 'width 0.3s ease'
              }}
            }})
          ),
          React.createElement('div', {{
            style: {{ fontSize: '14px', fontWeight: '700', color: '#991B1B', marginTop: '4px', textAlign: 'right' }}
          }}, Math.round(metric.value * progress) + '%')
        );
      }})
    ),
    React.createElement('div', {{
      style: {{ width: '2px', backgroundColor: '#D1D5DB', margin: '0 20px' }}
    }}),
    React.createElement('div', {{
      style: {{ flex: 1, paddingLeft: '40px' }}
    }},
      React.createElement('h3', {{
        style: {{ fontSize: '28px', fontWeight: '700', color: '#1E40AF', marginBottom: '30px', textAlign: 'center' }}
      }}, rightData.label),
      rightData.metrics.map(function(metric, i) {{
        return React.createElement('div', {{ key: i, style: {{ marginBottom: '20px' }} }},
          React.createElement('div', {{
            style: {{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}
          }}, metric.name),
          React.createElement('div', {{
            style: {{ width: '100%', height: '12px', backgroundColor: '#DBEAFE', borderRadius: '6px', overflow: 'hidden' }}
          }},
            React.createElement('div', {{
              style: {{
                width: (metric.value * progress) + '%',
                height: '100%',
                backgroundColor: '#2563EB',
                transition: 'width 0.3s ease'
              }}
            }})
          ),
          React.createElement('div', {{
            style: {{ fontSize: '14px', fontWeight: '700', color: '#1E40AF', marginTop: '4px', textAlign: 'right' }}
          }}, Math.round(metric.value * progress) + '%')
        );
      }})
    )
  );
}}"""

def get_timeline_roadmap(theme_colors: dict) -> str:
    """
    Beautiful horizontal timeline with milestones.
    Perfect for roadmaps, project phases, company history.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const milestones = props.milestones || [
    {{ quarter: 'Q1', title: 'Research', items: ['Market analysis', 'User interviews'], status: 'complete' }},
    {{ quarter: 'Q2', title: 'Design', items: ['Wireframes', 'Prototypes'], status: 'complete' }},
    {{ quarter: 'Q3', title: 'Build', items: ['MVP development', 'Testing'], status: 'active' }},
    {{ quarter: 'Q4', title: 'Launch', items: ['Beta release', 'Marketing'], status: 'upcoming' }}
  ];
  
  const activeIndex = state.activeIndex !== undefined ? state.activeIndex : -1;
  
  React.useEffect(function() {{
    if (isThumbnail) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = ((prev.activeIndex !== undefined ? prev.activeIndex : -1) + 1) % milestones.length;
        return {{ activeIndex: next }};
      }});
    }}, 2000);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const getStatusColor = function(status, isActive) {{
    if (isActive) return '{primary}';
    if (status === 'complete') return '#10B981';
    if (status === 'active') return '{primary}';
    return '#9CA3AF';
  }};
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      padding: '40px 60px',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)'
    }}
  }},
    React.createElement('div', {{
      style: {{ position: 'relative', marginBottom: '60px' }}
    }},
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          top: '20px',
          left: '40px',
          right: '40px',
          height: '4px',
          backgroundColor: '#E5E7EB',
          borderRadius: '2px'
        }}
      }}),
      React.createElement('div', {{
        style: {{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}
      }},
        milestones.map(function(milestone, i) {{
          const isActive = i === activeIndex;
          const color = getStatusColor(milestone.status, isActive);
          
          return React.createElement('div', {{
            key: i,
            style: {{ textAlign: 'center', flex: 1, position: 'relative' }}
          }},
            React.createElement('div', {{
              style: {{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: color,
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: '700',
                fontSize: '18px',
                transform: isActive ? 'scale(1.3)' : 'scale(1)',
                transition: 'transform 0.3s ease',
                boxShadow: isActive ? '0 4px 20px rgba(59,130,246,0.4)' : 'none',
                border: '3px solid white'
              }}
            }}, i + 1),
            React.createElement('div', {{
              style: {{
                fontSize: '14px',
                fontWeight: '700',
                color,
                marginBottom: '4px',
                transition: 'all 0.3s ease'
              }}
            }}, milestone.quarter),
            React.createElement('div', {{
              style: {{
                fontSize: '18px',
                fontWeight: isActive ? '700' : '600',
                color: '#111827',
                marginBottom: '8px',
                transition: 'all 0.3s ease'
              }}
            }}, milestone.title),
            milestone.items.map(function(item, j) {{
              return React.createElement('div', {{
                key: j,
                style: {{
                  fontSize: '12px',
                  color: '#6B7280',
                  marginBottom: '2px'
                }}
              }}, '• ' + item);
            }})
          );
        }})
      )
    )
  );
}}"""

def get_metric_cards_dashboard(theme_colors: dict) -> str:
    """
    Beautiful dashboard with multiple metric cards.
    Staggered animation, icons, trend indicators.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    secondary = theme_colors.get('secondary', '#8B5CF6')
    accent = theme_colors.get('accent', '#EC4899')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const metrics = props.metrics || [
    {{ label: 'Revenue', value: 2.4, unit: 'M', trend: '+23%', color: '{primary}', icon: '💰' }},
    {{ label: 'Users', value: 450, unit: 'K', trend: '+15%', color: '{secondary}', icon: '👥' }},
    {{ label: 'Satisfaction', value: 98, unit: '%', trend: '+5%', color: '{accent}', icon: '⭐' }},
    {{ label: 'Response Time', value: 1.2, unit: 's', trend: '-12%', color: '#10B981', icon: '⚡' }}
  ];
  
  const progress = state.progress || 0;
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.02;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 30);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '30px',
      padding: '40px',
      fontFamily: 'Inter, sans-serif',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #F0F9FF 100%)'
    }}
  }},
    metrics.map(function(metric, i) {{
      const delay = i * 0.1;
      const visible = progress > delay;
      const animProgress = visible ? Math.min(1, (progress - delay) / 0.3) : 0;
      
      return React.createElement('div', {{
        key: i,
        style: {{
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          opacity: animProgress,
          transform: 'translateY(' + ((1 - animProgress) * 20) + 'px)',
          transition: 'all 0.5s ease',
          borderLeft: '4px solid ' + metric.color
        }}
      }},
        React.createElement('div', {{
          style: {{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}
        }},
          React.createElement('div', {{
            style: {{ fontSize: '40px' }}
          }}, metric.icon),
          React.createElement('div', {{
            style: {{
              fontSize: '14px',
              fontWeight: '700',
              color: metric.trend.startsWith('+') ? '#10B981' : '#EF4444',
              backgroundColor: metric.trend.startsWith('+') ? '#ECFDF5' : '#FEF2F2',
              padding: '6px 12px',
              borderRadius: '8px'
            }}
          }}, metric.trend)
        ),
        React.createElement('div', {{
          style: {{ fontSize: '14px', fontWeight: '600', color: '#6B7280', marginBottom: '8px' }}
        }}, metric.label),
        React.createElement('div', {{
          style: {{ fontSize: '48px', fontWeight: '900', color: metric.color, lineHeight: '1' }}
        }}, (metric.value * animProgress).toFixed(metric.unit === '%' ? 0 : 1) + metric.unit)
      );
    }})
  );
}}"""

# Export all beautiful templates
BEAUTIFUL_CUSTOMCOMPONENT_TEMPLATES = {
    'radial_progress': {
        'description': 'Radial progress chart with concentric rings for multiple KPIs',
        'template': get_radial_progress_chart,
        'use_cases': ['KPI dashboard', 'progress tracking', 'multi-metric overview'],
        'props': ['metrics']
    },
    'funnel_viz': {
        'description': 'Animated funnel visualization for conversion rates',
        'template': get_funnel_visualization,
        'use_cases': ['conversion funnel', 'sales pipeline', 'process stages'],
        'props': ['stages']
    },
    'comparison_bars': {
        'description': 'Side-by-side comparison with animated bars',
        'template': get_comparison_bars,
        'use_cases': ['before/after', 'competitor comparison', 'A/B testing results'],
        'props': ['leftData', 'rightData']
    },
    'timeline_roadmap': {
        'description': 'Horizontal timeline with milestones and details',
        'template': get_timeline_roadmap,
        'use_cases': ['roadmap', 'project phases', 'company history', 'quarterly planning'],
        'props': ['milestones']
    },
    'metric_dashboard': {
        'description': 'Grid of metric cards with icons and trend indicators',
        'template': get_metric_cards_dashboard,
        'use_cases': ['dashboard', 'KPI overview', 'performance metrics'],
        'props': ['metrics']
    }
}

