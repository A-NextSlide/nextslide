"""
Elite CustomComponent Examples for Premium Deck Design

These components showcase sophisticated, minimal design principles
that prioritize typography and subtle animations over decorative shapes.
"""

# Animated Counter Component
ANIMATED_COUNTER = """
function render({ props, state, updateState }, instanceId) {
  // Initialize state
  if (!state.initialized) {
    updateState({ 
      count: 0, 
      initialized: true,
      targetReached: false 
    });
  }
  
  const targetValue = props.value || 100;
  const duration = props.duration || 2000;
  const currentCount = state.count || 0;
  
  // Animate counting
  if (!state.targetReached && currentCount < targetValue) {
    const increment = targetValue / (duration / 16); // 60fps
    setTimeout(() => {
      const newCount = Math.min(currentCount + increment, targetValue);
      updateState({ 
        count: newCount,
        targetReached: newCount >= targetValue
      });
    }, 16);
  }
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: props.fontFamily || 'Montserrat',
    }
  }, [
    React.createElement('div', {
      style: {
        fontSize: props.fontSize || '120px',
        fontWeight: props.fontWeight || '300',
        color: props.color || '#000',
        lineHeight: 1,
        letterSpacing: '-0.02em'
      }
    }, Math.floor(currentCount) + (props.suffix || '')),
    props.label && React.createElement('div', {
      style: {
        fontSize: props.labelSize || '24px',
        color: props.labelColor || '#666',
        marginTop: '16px',
        fontWeight: '400'
      }
    }, props.label)
  ]);
}
"""

# Gradient Text Component
GRADIENT_TEXT = """
function render({ props }, instanceId) {
  const gradientId = `gradient-${instanceId}`;
  
  return React.createElement('svg', {
    width: '100%',
    height: '100%',
    viewBox: `0 0 ${props.width || 800} ${props.height || 200}`,
    preserveAspectRatio: 'xMidYMid meet'
  }, [
    React.createElement('defs', {}, [
      React.createElement('linearGradient', {
        id: gradientId,
        x1: '0%',
        y1: '0%',
        x2: '100%',
        y2: '0%'
      }, [
        React.createElement('stop', {
          offset: '0%',
          stopColor: props.color1 || '#667eea'
        }),
        React.createElement('stop', {
          offset: '100%',
          stopColor: props.color2 || '#764ba2'
        })
      ])
    ]),
    React.createElement('text', {
      x: '50%',
      y: '50%',
      textAnchor: 'middle',
      dominantBaseline: 'middle',
      fill: `url(#${gradientId})`,
      fontSize: props.fontSize || '72px',
      fontFamily: props.fontFamily || 'Montserrat',
      fontWeight: props.fontWeight || '700',
      letterSpacing: '-0.02em'
    }, props.text || 'Gradient Text')
  ]);
}
"""

# Animated Text Reveal Component
TEXT_REVEAL = """
function render({ props, state, updateState }, instanceId) {
  if (!state.initialized) {
    updateState({ 
      initialized: true,
      visibleChars: 0
    });
  }
  
  const text = props.text || 'Revealing Text';
  const duration = props.duration || 2000;
  const visibleChars = state.visibleChars || 0;
  
  // Animate text reveal
  if (visibleChars < text.length) {
    const charsPerFrame = text.length / (duration / 50);
    setTimeout(() => {
      updateState({ 
        visibleChars: Math.min(visibleChars + charsPerFrame, text.length)
      });
    }, 50);
  }
  
  const visibleText = text.substring(0, Math.floor(visibleChars));
  const hiddenText = text.substring(Math.floor(visibleChars));
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: props.align || 'center',
      fontFamily: props.fontFamily || 'Montserrat',
      fontSize: props.fontSize || '48px',
      fontWeight: props.fontWeight || '400',
      color: props.color || '#000',
      letterSpacing: '-0.01em',
      lineHeight: props.lineHeight || 1.2
    }
  }, [
    React.createElement('span', {}, visibleText),
    React.createElement('span', {
      style: { opacity: 0 }
    }, hiddenText)
  ]);
}
"""

# Centered Text in Shape Component
CENTERED_TEXT_SHAPE = """
function render({ props }, instanceId) {
  // Extract all customizable properties
  const text = props.text || "Centered Text";
  const fontSize = props.fontSize || 48;
  const textColor = props.textColor || "#FFFFFF";
  const bgColor = props.bgColor || "#000000";
  const borderRadius = props.borderRadius || 20;
  const padding = props.padding || 40;
  const fontWeight = props.fontWeight || "600";
  const fontFamily = props.fontFamily || "Inter";
  const opacity = props.opacity || 1;
  const borderWidth = props.borderWidth || 0;
  const borderColor = props.borderColor || "#FFFFFF";
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',       // Vertical center
      justifyContent: 'center',   // Horizontal center
      backgroundColor: bgColor,
      borderRadius: borderRadius + 'px',
      padding: padding + 'px',
      boxSizing: 'border-box',
      opacity: opacity,
      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none'
    }
  }, 
    React.createElement('div', {
      style: {
        fontSize: fontSize + 'px',
        color: textColor,
        fontFamily: fontFamily,
        fontWeight: fontWeight,
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: '-0.02em'
      }
    }, text)
  );
}
"""

# Multi-line Centered Text Component
MULTILINE_CENTERED_TEXT = """
function render({ props }, instanceId) {
  // Extract properties
  const lines = [
    props.line1 || "First Line",
    props.line2 || "Second Line",
    props.line3 || ""
  ].filter(line => line); // Remove empty lines
  
  const fontSize = props.fontSize || 36;
  const lineHeight = props.lineHeight || 1.4;
  const textColor = props.textColor || "#000000";
  const bgColor = props.bgColor || "transparent";
  const borderRadius = props.borderRadius || 0;
  const padding = props.padding || 20;
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bgColor,
      borderRadius: borderRadius + 'px',
      padding: padding + 'px',
      boxSizing: 'border-box'
    }
  }, 
    lines.map((line, index) => 
      React.createElement('div', {
        key: index,
        style: {
          fontSize: fontSize + 'px',
          color: textColor,
                              fontFamily: 'Montserrat',
          fontWeight: '500',
          textAlign: 'center',
          lineHeight: lineHeight,
          marginBottom: index < lines.length - 1 ? '8px' : '0'
        }
      }, line)
    )
  );
}
"""

# Stat Dashboard Component (Multi-card grid)
STAT_DASHBOARD = """
function render({ props }) {
  var items = props.items || [
    {label: 'Revenue', value: '$2.5M'},
    {label: 'Users', value: '45K'},
    {label: 'Growth', value: '+24%'}
  ];
  var primaryColor = props.primaryColor || '#3B82F6';
  var textColor = getContrastTextColor(primaryColor);
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      gap: '40px',
      padding: '24px'
    }
  }, items.map(function(item, i) {
    return React.createElement('div', {
      key: i,
      style: {
        flex: 1,
        background: primaryColor,
        padding: '48px',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
      }
    }, [
      React.createElement('div', {
        style: {
          fontSize: '72px',
          fontWeight: '900',
          color: textColor
        }
      }, item.value),
      React.createElement('div', {
        style: {
          fontSize: '24px',
          color: textColor,
          marginTop: '12px',
          opacity: 0.85
        }
      }, item.label)
    ]);
  }));
}
"""

# Icon With Text Component
ICON_TEXT = """
function render({ props }) {
  var text = props.text || 'Key Insight';
  var iconName = props.iconName || 'lightbulb';
  var color = props.color || '#10b981';
  var textColor = getContrastTextColor(color + '15');
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      padding: '32px',
      background: color + '15',
      borderRadius: '16px',
      border: '2px solid ' + color + '40'
    }
  }, [
    React.createElement('div', {
      style: {
        fontSize: '48px',
        color: color,
        fontWeight: '600'
      }
    }, '💡'),
    React.createElement('div', {
      style: {
        fontSize: '36px',
        fontWeight: '600',
        color: textColor,
        lineHeight: 1.3
      }
    }, text)
  ]);
}
"""

# Simple Stat Card (Single metric)
SIMPLE_STAT_CARD = """
function render({ props }) {
  var value = props.value || '92%';
  var label = props.label || 'Customer Satisfaction';
  var bg = props.primaryColor || '#3B82F6';
  var textColor = getContrastTextColor(bg);
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      borderRadius: '24px',
      padding: '48px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
    }
  }, [
    React.createElement('div', {
      style: {
        fontSize: '120px',
        fontWeight: '900',
        color: textColor,
        lineHeight: 1
      }
    }, value),
    React.createElement('div', {
      style: {
        fontSize: '32px',
        color: textColor,
        marginTop: '16px',
        opacity: 0.85,
        textAlign: 'center'
      }
    }, label)
  ]);
}
"""

# Feature Card Component
FEATURE_CARD = """
function render({ props }) {
  var title = props.title || 'Feature Title';
  var description = props.description || 'Feature description goes here';
  var iconBg = props.primaryColor || '#3B82F6';
  var textColor = props.textColor || '#1F2937';
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '40px',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
      borderRadius: '20px',
      border: '1px solid #E5E7EB',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
    }
  }, [
    React.createElement('div', {
      style: {
        width: '64px',
        height: '64px',
        background: iconBg,
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        marginBottom: '24px'
      }
    }, '✓'),
    React.createElement('div', {
      style: {
        fontSize: '28px',
        fontWeight: '700',
        color: textColor,
        marginBottom: '12px'
      }
    }, title),
    React.createElement('div', {
      style: {
        fontSize: '20px',
        color: textColor,
        opacity: 0.7,
        lineHeight: 1.5
      }
    }, description)
  ]);
}
"""

# Progress Bar Component
PROGRESS_BAR = """
function render({ props }) {
  var label = props.label || 'Progress';
  var value = props.value || 75;
  var color = props.color || '#10b981';
  var textColor = props.textColor || '#1F2937';
  
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '32px'
    }
  }, [
    React.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }
    }, [
      React.createElement('div', {
        style: {
          fontSize: '24px',
          fontWeight: '600',
          color: textColor
        }
      }, label),
      React.createElement('div', {
        style: {
          fontSize: '24px',
          fontWeight: '700',
          color: color
        }
      }, value + '%')
    ]),
    React.createElement('div', {
      style: {
        width: '100%',
        height: '16px',
        background: '#E5E7EB',
        borderRadius: '8px',
        overflow: 'hidden'
      }
    }, React.createElement('div', {
      style: {
        width: value + '%',
        height: '100%',
        background: 'linear-gradient(90deg, ' + color + ' 0%, ' + color + 'CC 100%)',
        borderRadius: '8px',
        transition: 'width 0.3s ease'
      }
    }))
  ]);
}
"""

# Export component library
ELITE_COMPONENTS = {
    "AnimatedCounter": {
        "name": "Animated Counter",
        "description": "Smoothly animating number counter",
        "code": ANIMATED_COUNTER,
        "defaultProps": {
            "value": 100,
            "suffix": "%",
            "label": "Growth",
            "duration": 2000,
            "fontSize": "120px",
            "fontWeight": "300"
        }
    },
    "GradientText": {
        "name": "Gradient Text",
        "description": "Text with gradient fill",
        "code": GRADIENT_TEXT,
        "defaultProps": {
            "text": "Innovation",
            "fontSize": "72px",
            "fontWeight": "700",
            "color1": "#667eea",
            "color2": "#764ba2"
        }
    },
    "TextReveal": {
        "name": "Text Reveal",
        "description": "Animated text reveal effect",
        "code": TEXT_REVEAL,
        "defaultProps": {
            "text": "The future is here",
            "duration": 2000,
            "fontSize": "48px",
            "align": "center"
        }
    },
    "StatDashboard": {
        "name": "Stat Dashboard",
        "description": "Multi-card metrics dashboard",
        "code": STAT_DASHBOARD,
        "defaultProps": {
            "items": [
                {"label": "Revenue", "value": "$2.5M"},
                {"label": "Users", "value": "45K"},
                {"label": "Growth", "value": "+24%"}
            ],
            "primaryColor": "#3B82F6"
        }
    },
    "SimpleStatCard": {
        "name": "Simple Stat Card",
        "description": "Single metric card with large number",
        "code": SIMPLE_STAT_CARD,
        "defaultProps": {
            "value": "92%",
            "label": "Customer Satisfaction",
            "primaryColor": "#3B82F6"
        }
    },
    "IconText": {
        "name": "Icon With Text",
        "description": "Icon paired with text in a styled container",
        "code": ICON_TEXT,
        "defaultProps": {
            "text": "Key Insight",
            "iconName": "lightbulb",
            "color": "#10b981"
        }
    },
    "FeatureCard": {
        "name": "Feature Card",
        "description": "Feature card with icon, title, and description",
        "code": FEATURE_CARD,
        "defaultProps": {
            "title": "Feature Title",
            "description": "Feature description goes here",
            "primaryColor": "#3B82F6"
        }
    },
    "ProgressBar": {
        "name": "Progress Bar",
        "description": "Horizontal progress bar with label and percentage",
        "code": PROGRESS_BAR,
        "defaultProps": {
            "label": "Progress",
            "value": 75,
            "color": "#10b981"
        }
    }
} 