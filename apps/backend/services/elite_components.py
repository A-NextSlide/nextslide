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
    }
} 