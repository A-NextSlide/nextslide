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

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var metrics = props.metrics || [
    {{ label: 'Revenue', value: 87, target: 100, color: '{primary}' }},
    {{ label: 'Customer Satisfaction', value: 92, target: 100, color: '{secondary}' }},
    {{ label: 'Market Share', value: 65, target: 100, color: '{accent}' }}
  ];

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var stages = props.stages || [
    {{ label: 'Visitors', value: 10000, color: '{primary}' }},
    {{ label: 'Leads', value: 2500, color: '#8B5CF6' }},
    {{ label: 'Qualified', value: 1000, color: '#EC4899' }},
    {{ label: 'Customers', value: 250, color: '#10B981' }}
  ];

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var leftData = props.leftData || {{ label: 'Before', metrics: [
    {{ name: 'Speed', value: 45 }},
    {{ name: 'Accuracy', value: 60 }},
    {{ name: 'Cost', value: 80 }}
  ]}};
  var rightData = props.rightData || {{ label: 'After', metrics: [
    {{ name: 'Speed', value: 95 }},
    {{ name: 'Accuracy', value: 98 }},
    {{ name: 'Cost', value: 35 }}
  ]}};

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var milestones = props.milestones || [
    {{ quarter: 'Q1', title: 'Research', items: ['Market analysis', 'User interviews'], status: 'complete' }},
    {{ quarter: 'Q2', title: 'Design', items: ['Wireframes', 'Prototypes'], status: 'complete' }},
    {{ quarter: 'Q3', title: 'Build', items: ['MVP development', 'Testing'], status: 'active' }},
    {{ quarter: 'Q4', title: 'Launch', items: ['Beta release', 'Marketing'], status: 'upcoming' }}
  ];

  var activeIndex = state.activeIndex !== undefined ? state.activeIndex : -1;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var metrics = props.metrics || [
    {{ label: 'Revenue', value: 2.4, unit: 'M', trend: '+23%', color: '{primary}', icon: '💰' }},
    {{ label: 'Users', value: 450, unit: 'K', trend: '+15%', color: '{secondary}', icon: '👥' }},
    {{ label: 'Satisfaction', value: 98, unit: '%', trend: '+5%', color: '{accent}', icon: '⭐' }},
    {{ label: 'Response Time', value: 1.2, unit: 's', trend: '-12%', color: '#10B981', icon: '⚡' }}
  ];

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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

def get_three_card_stat_grid(theme_colors: dict) -> str:
    """
    Beautiful 3-card horizontal grid for presenting key metrics.
    Perfect for minimal content slides with 2-3 stats.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    secondary = theme_colors.get('secondary', '#8B5CF6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var cards = props.cards || [
    {{ value: '42%', label: 'Growth Rate', color: '{accent}' }},
    {{ value: '$4.2M', label: 'Revenue', color: '{secondary}' }},
    {{ value: '850+', label: 'Customers', color: '{primary}' }}
  ];

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.015;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 25);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const scale = Math.min(progress * 1.2, 1);
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '60px',
      padding: '0 20px',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}
  }},
    cards.map(function(card, i) {{
      const delay = i * 0.15;
      const cardScale = Math.max(0, Math.min((progress - delay) * 2, 1));
      
      return React.createElement('div', {{
        key: i,
        style: {{
          flex: 1,
          height: '100%',
          background: 'linear-gradient(135deg, ' + card.color + '15 0%, ' + card.color + '25 100%)',
          borderRadius: '24px',
          padding: '60px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,' + (0.12 * cardScale) + ')',
          transform: 'scale(' + (0.95 + 0.05 * cardScale) + ') translateY(' + (20 * (1 - cardScale)) + 'px)',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          opacity: cardScale
        }}
      }},
        React.createElement('div', {{
          style: {{
            fontSize: '120px',
            fontWeight: '900',
            color: card.color,
            marginBottom: '20px',
            lineHeight: 1,
            textAlign: 'center'
          }}
        }}, card.value),
        React.createElement('div', {{
          style: {{
            fontSize: '28px',
            fontWeight: '600',
            color: '{primary}',
            textAlign: 'center',
            opacity: 0.85
          }}
        }}, card.label)
      );
    }})
  );
}}"""

def get_two_card_comparison(theme_colors: dict) -> str:
    """
    Two large cards side-by-side for before/after or comparison.
    Dramatic and visually stunning.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var leftCard = props.leftCard || {{ value: 'Before', subtitle: '2023', detail: '$2.1M' }};
  var rightCard = props.rightCard || {{ value: 'After', subtitle: '2024', detail: '$4.2M' }};

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
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
      flexDirection: 'row',
      gap: '80px',
      padding: '40px',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}
  }},
    [leftCard, rightCard].map(function(card, i) {{
      const isLeft = i === 0;
      const cardColor = isLeft ? '{primary}' : '{accent}';
      const delay = i * 0.2;
      const scale = Math.max(0, Math.min((progress - delay) * 1.5, 1));
      
      return React.createElement('div', {{
        key: i,
        style: {{
          flex: 1,
          height: '100%',
          background: 'linear-gradient(135deg, ' + cardColor + '18 0%, ' + cardColor + '08 100%)',
          borderRadius: '32px',
          padding: '80px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,' + (0.15 * scale) + ')',
          border: '2px solid ' + cardColor + '40',
          transform: 'scale(' + (0.9 + 0.1 * scale) + ') translateY(' + (30 * (1 - scale)) + 'px)',
          transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          opacity: scale,
          position: 'relative',
          overflow: 'hidden'
        }}
      }},
        React.createElement('div', {{
          style: {{
            position: 'absolute',
            top: '-50%',
            right: '-20%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle, ' + cardColor + '12 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        }}),
        React.createElement('div', {{
          style: {{
            fontSize: '52px',
            fontWeight: '800',
            color: cardColor,
            marginBottom: '16px',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '2px',
            textAlign: 'center'
          }}
        }}, card.value),
        React.createElement('div', {{
          style: {{
            fontSize: '32px',
            fontWeight: '600',
            color: '{primary}',
            marginBottom: '40px',
            opacity: 0.7,
            textAlign: 'center'
          }}
        }}, card.subtitle),
        React.createElement('div', {{
          style: {{
            fontSize: '140px',
            fontWeight: '900',
            color: cardColor,
            lineHeight: 1,
            textAlign: 'center'
          }}
        }}, card.detail)
      );
    }})
  );
}}"""

def get_hero_stat_card(theme_colors: dict) -> str:
    """
    Single massive hero stat in a beautiful card.
    For slides with just ONE key metric to showcase.
    """
    accent = theme_colors.get('accent', '#EC4899')
    primary = theme_colors.get('primary', '#3B82F6')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var value = props.value || '92%';
  var label = props.label || 'Customer Satisfaction';
  var subtitle = props.subtitle || 'Leading the industry';

  var progress = state.progress || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);
  
  React.useEffect(function() {{
    if (isThumbnail || progress >= 1) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.progress || 0) + 0.015;
        return {{ progress: next >= 1 ? 1 : next }};
      }});
    }}, 25);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const scale = Math.min(progress * 1.1, 1);
  const rotate = (1 - progress) * 10;
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '60px',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}
  }},
    React.createElement('div', {{
      style: {{
        width: '100%',
        maxWidth: '900px',
        height: '100%',
        background: 'linear-gradient(135deg, {accent}20 0%, {accent}05 50%, {primary}15 100%)',
        borderRadius: '40px',
        padding: '100px 80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxShadow: '0 40px 100px rgba(0,0,0,' + (0.2 * scale) + ')',
        border: '3px solid {accent}30',
        transform: 'scale(' + (0.85 + 0.15 * scale) + ') rotate(' + rotate + 'deg)',
        transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        opacity: scale,
        position: 'relative',
        overflow: 'hidden'
      }}
    }},
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '150%',
          height: '150%',
          background: 'radial-gradient(circle, {accent}15 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'pulse 3s infinite'
        }}
      }}),
      React.createElement('div', {{
        style: {{
          fontSize: '280px',
          fontWeight: '900',
          color: '{accent}',
          lineHeight: 1,
          marginBottom: '40px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1
        }}
      }}, value),
      React.createElement('div', {{
        style: {{
          fontSize: '56px',
          fontWeight: '700',
          color: '{primary}',
          marginBottom: '24px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1
        }}
      }}, label),
      React.createElement('div', {{
        style: {{
          fontSize: '36px',
          fontWeight: '500',
          color: '{primary}',
          opacity: 0.7,
          textAlign: 'center',
          position: 'relative',
          zIndex: 1
        }}
      }}, subtitle)
    )
  );
}}"""

def get_interactive_quiz(theme_colors: dict) -> str:
    """
    Interactive multiple-choice quiz component for educational content.
    Perfect for knowledge checks and engagement.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    secondary = theme_colors.get('secondary', '#8B5CF6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var question = props.question || 'Which of the following best describes agile methodology?';
  var options = props.options || [
    'Waterfall development with strict phases',
    'Iterative development with continuous feedback',
    'A project management tool',
    'A programming language'
  ];
  var correctAnswer = props.correctAnswer || 1;
  var explanation = props.explanation || 'Agile emphasizes iterative development and continuous customer feedback.';

  var selectedAnswer = state.selectedAnswer;
  var showResult = state.showResult || false;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);

  if (isThumbnail) {{
    return React.createElement('div', {{
      style: {{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, {primary}15 0%, {accent}10 100%)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        fontFamily: 'Inter, sans-serif'
      }}
    }},
      React.createElement('div', {{
        style: {{
          fontSize: '48px',
          fontWeight: '900',
          color: '{primary}',
          textAlign: 'center'
        }}
      }}, '❓ Quiz')
    );
  }}

  var handleOptionClick = function(index) {{
    if (showResult) return;
    updateState({{ selectedAnswer: index, showResult: true }});
  }};

  var getOptionStyle = function(index) {{
    var baseStyle = {{
      padding: '20px 28px',
      marginBottom: '16px',
      borderRadius: '12px',
      cursor: showResult ? 'default' : 'pointer',
      transition: 'all 0.3s ease',
      fontSize: '20px',
      fontWeight: '600',
      border: '2px solid',
      textAlign: 'left'
    }};

    if (!showResult) {{
      return {{
        ...baseStyle,
        backgroundColor: 'white',
        borderColor: '{primary}40',
        color: '{primary}'
      }};
    }}

    if (index === correctAnswer) {{
      return {{
        ...baseStyle,
        backgroundColor: '#10B98130',
        borderColor: '#10B981',
        color: '#065F46'
      }};
    }}

    if (index === selectedAnswer && index !== correctAnswer) {{
      return {{
        ...baseStyle,
        backgroundColor: '#EF444430',
        borderColor: '#EF4444',
        color: '#991B1B'
      }};
    }}

    return {{
      ...baseStyle,
      backgroundColor: 'white',
      borderColor: '{primary}20',
      color: '{primary}',
      opacity: 0.5
    }};
  }};

  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      borderRadius: '24px',
      padding: '48px',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto'
    }}
  }},
    React.createElement('div', {{
      style: {{
        fontSize: '28px',
        fontWeight: '700',
        color: '{primary}',
        marginBottom: '32px',
        lineHeight: '1.4'
      }}
    }}, question),
    React.createElement('div', {{
      style: {{ flex: 1 }}
    }},
      options.map(function(option, index) {{
        return React.createElement('div', {{
          key: index,
          onClick: function() {{ handleOptionClick(index); }},
          style: getOptionStyle(index)
        }},
          React.createElement('span', {{
            style: {{ fontWeight: '800', marginRight: '12px' }}
          }}, String.fromCharCode(65 + index) + '.'),
          option,
          showResult && index === correctAnswer ? React.createElement('span', {{
            style: {{ marginLeft: '12px', fontSize: '24px' }}
          }}, '✓') : null,
          showResult && index === selectedAnswer && index !== correctAnswer ? React.createElement('span', {{
            style: {{ marginLeft: '12px', fontSize: '24px' }}
          }}, '✗') : null
        );
      }})
    ),
    showResult ? React.createElement('div', {{
      style: {{
        marginTop: '24px',
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: selectedAnswer === correctAnswer ? '#10B98120' : '#FEF3C7',
        borderLeft: '4px solid ' + (selectedAnswer === correctAnswer ? '#10B981' : '#F59E0B')
      }}
    }},
      React.createElement('div', {{
        style: {{
          fontSize: '20px',
          fontWeight: '700',
          color: selectedAnswer === correctAnswer ? '#065F46' : '#92400E',
          marginBottom: '8px'
        }}
      }}, selectedAnswer === correctAnswer ? '✓ Correct!' : '✗ Incorrect'),
      React.createElement('div', {{
        style: {{
          fontSize: '18px',
          color: selectedAnswer === correctAnswer ? '#047857' : '#78350F',
          lineHeight: '1.6'
        }}
      }}, explanation)
    ) : null
  );
}}"""

def get_interactive_poll(theme_colors: dict) -> str:
    """
    Interactive poll/voting component for audience engagement.
    Shows results with animated bars.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var question = props.question || 'What is your biggest challenge?';
  var pollOptions = props.options || [
    'Time Management',
    'Resource Allocation',
    'Team Communication',
    'Budget Constraints'
  ];

  var votes = state.votes || pollOptions.map(function() {{ return 0; }});
  var hasVoted = state.hasVoted || false;
  var totalVotes = votes.reduce(function(sum, v) {{ return sum + v; }}, 0);
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);

  if (isThumbnail) {{
    return React.createElement('div', {{
      style: {{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, {primary}15 0%, {accent}10 100%)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        fontFamily: 'Inter, sans-serif'
      }}
    }},
      React.createElement('div', {{
        style: {{
          fontSize: '48px',
          fontWeight: '900',
          color: '{primary}',
          textAlign: 'center'
        }}
      }}, '📊 Poll')
    );
  }}

  var handleVote = function(index) {{
    if (hasVoted) return;
    var newVotes = votes.slice();
    newVotes[index] = newVotes[index] + 1;
    updateState({{ votes: newVotes, hasVoted: true }});
  }};

  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      borderRadius: '24px',
      padding: '48px',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}
  }},
    React.createElement('div', {{
      style: {{
        fontSize: '32px',
        fontWeight: '700',
        color: '{primary}',
        marginBottom: '32px',
        textAlign: 'center'
      }}
    }}, question),
    React.createElement('div', {{
      style: {{
        fontSize: '18px',
        color: '{primary}',
        opacity: 0.7,
        marginBottom: '24px',
        textAlign: 'center'
      }}
    }}, totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '')),
    pollOptions.map(function(option, index) {{
      var percentage = totalVotes > 0 ? Math.round((votes[index] / totalVotes) * 100) : 0;
      return React.createElement('div', {{
        key: index,
        onClick: function() {{ handleVote(index); }},
        style: {{
          marginBottom: '20px',
          cursor: hasVoted ? 'default' : 'pointer',
          transition: 'transform 0.2s ease',
          transform: hasVoted ? 'scale(1)' : 'scale(1)'
        }}
      }},
        React.createElement('div', {{
          style: {{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
            fontSize: '18px',
            fontWeight: '600',
            color: '{primary}'
          }}
        }},
          React.createElement('span', {{}}, option),
          hasVoted ? React.createElement('span', {{
            style: {{ color: '{accent}', fontWeight: '800' }}
          }}, percentage + '%') : null
        ),
        React.createElement('div', {{
          style: {{
            width: '100%',
            height: '12px',
            backgroundColor: '{primary}20',
            borderRadius: '6px',
            overflow: 'hidden'
          }}
        }},
          React.createElement('div', {{
            style: {{
              width: (hasVoted ? percentage : 0) + '%',
              height: '100%',
              backgroundColor: '{accent}',
              transition: 'width 0.8s ease',
              borderRadius: '6px'
            }}
          }})
        )
      );
    }})
  );
}}"""

def get_progress_tracker(theme_colors: dict) -> str:
    """
    Visual progress tracker with animated milestones.
    Perfect for showing completion status.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var steps = props.steps || [
    {{ label: 'Planning', status: 'complete' }},
    {{ label: 'Design', status: 'complete' }},
    {{ label: 'Development', status: 'active' }},
    {{ label: 'Testing', status: 'pending' }},
    {{ label: 'Launch', status: 'pending' }}
  ];

  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);

  var getStepColor = function(status) {{
    if (status === 'complete') return '#10B981';
    if (status === 'active') return '{accent}';
    return '{primary}40';
  }};

  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      borderRadius: '24px',
      padding: '48px',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}
  }},
    React.createElement('div', {{
      style: {{ position: 'relative', padding: '20px 0' }}
    }},
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          top: '50%',
          left: '0',
          right: '0',
          height: '4px',
          backgroundColor: '{primary}20',
          transform: 'translateY(-50%)',
          zIndex: 0
        }}
      }}),
      React.createElement('div', {{
        style: {{
          display: 'flex',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 1
        }}
      }},
        steps.map(function(step, index) {{
          var color = getStepColor(step.status);
          return React.createElement('div', {{
            key: index,
            style: {{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          }},
            React.createElement('div', {{
              style: {{
                width: step.status === 'active' ? '56px' : '48px',
                height: step.status === 'active' ? '56px' : '48px',
                borderRadius: '50%',
                backgroundColor: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                fontSize: '24px',
                fontWeight: '900',
                color: 'white',
                transition: 'all 0.3s ease',
                border: '4px solid white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            }}, step.status === 'complete' ? '✓' : String(index + 1)),
            React.createElement('div', {{
              style: {{
                fontSize: step.status === 'active' ? '18px' : '16px',
                fontWeight: step.status === 'active' ? '700' : '600',
                color: step.status === 'pending' ? '{primary}60' : '{primary}',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
            }}, step.label)
          );
        }})
      )
    )
  );
}}"""

def get_step_by_step_reveal(theme_colors: dict) -> str:
    """
    Step-by-step content reveal with navigation.
    Perfect for explaining processes.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#EC4899')

    return f"""function render({{ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }}) {{
  var items = props.items || [
    {{ title: 'Step 1: Define', description: 'Clearly define your objectives and success criteria.', icon: '🎯' }},
    {{ title: 'Step 2: Plan', description: 'Create a detailed action plan with milestones.', icon: '📋' }},
    {{ title: 'Step 3: Execute', description: 'Implement your plan with consistent effort.', icon: '⚡' }},
    {{ title: 'Step 4: Review', description: 'Analyze results and iterate for improvement.', icon: '📊' }}
  ];

  var currentStep = state.currentStep || 0;
  var availableWidth = (props.width || containerWidth || 800);
  var availableHeight = (props.height || containerHeight || 600);

  if (isThumbnail) {{
    return React.createElement('div', {{
      style: {{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, {primary}15 0%, {accent}10 100%)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        fontFamily: 'Inter, sans-serif'
      }}
    }},
      React.createElement('div', {{
        style: {{
          fontSize: '48px',
          fontWeight: '900',
          color: '{primary}',
          textAlign: 'center'
        }}
      }}, items[0].icon)
    );
  }}

  var handleNext = function() {{
    if (currentStep < items.length - 1) {{
      updateState({{ currentStep: currentStep + 1 }});
    }}
  }};

  var handlePrev = function() {{
    if (currentStep > 0) {{
      updateState({{ currentStep: currentStep - 1 }});
    }}
  }};

  var item = items[currentStep];

  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      borderRadius: '24px',
      padding: '48px',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}
  }},
    React.createElement('div', {{
      style: {{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center'
      }}
    }},
      React.createElement('div', {{
        style: {{
          fontSize: '96px',
          marginBottom: '32px'
        }}
      }}, item.icon),
      React.createElement('div', {{
        style: {{
          fontSize: '36px',
          fontWeight: '700',
          color: '{primary}',
          marginBottom: '20px'
        }}
      }}, item.title),
      React.createElement('div', {{
        style: {{
          fontSize: '22px',
          color: '{primary}',
          opacity: 0.8,
          lineHeight: '1.6',
          maxWidth: '600px'
        }}
      }}, item.description)
    ),
    React.createElement('div', {{
      style: {{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '32px'
      }}
    }},
      React.createElement('button', {{
        onClick: handlePrev,
        disabled: currentStep === 0,
        style: {{
          padding: '12px 24px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: currentStep === 0 ? '{primary}20' : '{primary}',
          color: currentStep === 0 ? '{primary}60' : 'white',
          fontSize: '16px',
          fontWeight: '600',
          cursor: currentStep === 0 ? 'not-allowed' : 'pointer'
        }}
      }}, '← Previous'),
      React.createElement('div', {{
        style: {{
          fontSize: '16px',
          fontWeight: '600',
          color: '{primary}'
        }}
      }}, (currentStep + 1) + ' / ' + items.length),
      React.createElement('button', {{
        onClick: handleNext,
        disabled: currentStep === items.length - 1,
        style: {{
          padding: '12px 24px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: currentStep === items.length - 1 ? '{primary}20' : '{accent}',
          color: currentStep === items.length - 1 ? '{primary}60' : 'white',
          fontSize: '16px',
          fontWeight: '600',
          cursor: currentStep === items.length - 1 ? 'not-allowed' : 'pointer'
        }}
      }}, 'Next →')
    )
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
    },
    'three_card_grid': {
        'description': 'Beautiful 3-card horizontal grid for key metrics - PERFECT FOR PRESENTATION MODE',
        'template': get_three_card_stat_grid,
        'use_cases': ['minimal content slides', '2-3 key stats', 'presentation mode', 'visual impact'],
        'props': ['cards']
    },
    'two_card_comparison': {
        'description': 'Two large dramatic cards for before/after or comparison',
        'template': get_two_card_comparison,
        'use_cases': ['before/after', 'comparison', 'transformation', 'growth showcase'],
        'props': ['leftCard', 'rightCard']
    },
    'hero_stat_card': {
        'description': 'Single massive hero stat in a stunning card - PERFECT FOR ONE BIG NUMBER',
        'template': get_hero_stat_card,
        'use_cases': ['single metric', 'hero number', 'key stat', 'dramatic reveal'],
        'props': ['value', 'label', 'subtitle']
    },
    'interactive_quiz': {
        'description': 'Interactive multiple-choice quiz for educational content - PERFECT FOR KNOWLEDGE CHECKS',
        'template': get_interactive_quiz,
        'use_cases': ['education', 'training', 'knowledge assessment', 'engagement', 'learning'],
        'props': ['question', 'options', 'correctAnswer', 'explanation']
    },
    'interactive_poll': {
        'description': 'Interactive poll/voting component with animated results - PERFECT FOR AUDIENCE ENGAGEMENT',
        'template': get_interactive_poll,
        'use_cases': ['audience engagement', 'voting', 'feedback collection', 'opinion gathering'],
        'props': ['question', 'options']
    },
    'progress_tracker': {
        'description': 'Visual progress tracker with animated milestones - PERFECT FOR PROJECT STATUS',
        'template': get_progress_tracker,
        'use_cases': ['project tracking', 'milestones', 'progress visualization', 'status updates'],
        'props': ['steps']
    },
    'step_by_step': {
        'description': 'Step-by-step content reveal with navigation - PERFECT FOR PROCESS EXPLANATIONS',
        'template': get_step_by_step_reveal,
        'use_cases': ['tutorials', 'process explanation', 'guided learning', 'sequential content'],
        'props': ['items']
    }
}

