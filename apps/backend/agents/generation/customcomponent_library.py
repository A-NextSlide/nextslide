"""
CustomComponent Library - Pre-built JS-powered interactive components

These templates provide ready-to-use CustomComponents for common
interactive patterns. Models can use these or create custom ones.
"""

def get_animated_counter_template(theme_colors: dict) -> str:
    """
    Animated counter that counts up to a target number.
    Perfect for stat slides with impact.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    secondary = theme_colors.get('secondary', '#8B5CF6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const targetValue = props.targetValue || 2400000000;
  const prefix = props.prefix || '$';
  const suffix = props.suffix || '';
  const duration = props.duration || 2000;
  const label = props.label || '';
  
  const currentValue = state.currentValue || 0;
  
  React.useEffect(function() {{
    if (isThumbnail || currentValue >= targetValue) return;
    
    const increment = targetValue / (duration / 16);
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        const next = (prev.currentValue || 0) + increment;
        if (next >= targetValue) {{
          clearInterval(interval);
          return {{ currentValue: targetValue }};
        }}
        return {{ currentValue: next }};
      }});
    }}, 16);
    
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const formatNumber = function(num) {{
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
  }};
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Inter, sans-serif'
    }}
  }},
    React.createElement('div', {{
      style: {{
        fontSize: '180px',
        fontWeight: '900',
        color: '{primary}',
        lineHeight: '1',
        textAlign: 'center'
      }}
    }}, prefix + formatNumber(currentValue) + suffix),
    label ? React.createElement('div', {{
      style: {{
        fontSize: '36px',
        fontWeight: '500',
        color: '{secondary}',
        marginTop: '20px',
        textAlign: 'center'
      }}
    }}, label) : null
  );
}}"""

def get_comparison_slider_template(theme_colors: dict) -> str:
    """
    Before/after comparison slider.
    Great for product comparisons, A/B tests.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const leftLabel = props.leftLabel || 'Before';
  const rightLabel = props.rightLabel || 'After';
  const leftValue = props.leftValue || '45%';
  const rightValue = props.rightValue || '95%';
  const metric = props.metric || 'Performance';
  
  const sliderPos = state.sliderPos !== undefined ? state.sliderPos : 50;
  
  const handleSlide = function(e) {{
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    updateState({{ sliderPos: Math.max(0, Math.min(100, percent)) }});
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
      padding: '40px'
    }}
  }},
    React.createElement('div', {{
      style: {{
        fontSize: '32px',
        fontWeight: '600',
        color: '{primary}',
        marginBottom: '40px'
      }}
    }}, metric),
    React.createElement('div', {{
      style: {{
        width: '100%',
        height: '200px',
        position: 'relative',
        cursor: 'pointer',
        borderRadius: '16px',
        overflow: 'hidden'
      }},
      onMouseMove: handleSlide,
      onClick: handleSlide
    }},
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          left: 0,
          top: 0,
          width: sliderPos + '%',
          height: '100%',
          backgroundColor: '#EF4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}
      }},
        React.createElement('div', {{
          style: {{ fontSize: '48px', fontWeight: '700', color: 'white' }}
        }}, leftValue),
        React.createElement('div', {{
          style: {{ fontSize: '24px', color: 'rgba(255,255,255,0.8)' }}
        }}, leftLabel)
      ),
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          left: sliderPos + '%',
          top: 0,
          width: (100 - sliderPos) + '%',
          height: '100%',
          backgroundColor: '#10B981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}
      }},
        React.createElement('div', {{
          style: {{ fontSize: '48px', fontWeight: '700', color: 'white' }}
        }}, rightValue),
        React.createElement('div', {{
          style: {{ fontSize: '24px', color: 'rgba(255,255,255,0.8)' }}
        }}, rightLabel)
      ),
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          left: sliderPos + '%',
          top: 0,
          width: '4px',
          height: '100%',
          backgroundColor: 'white',
          boxShadow: '0 0 20px rgba(0,0,0,0.3)'
        }}
      }})
    )
  );
}}"""

def get_progress_timeline_template(theme_colors: dict) -> str:
    """
    Animated progress timeline showing steps.
    Perfect for process/roadmap slides.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    accent = theme_colors.get('accent', '#8B5CF6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const steps = props.steps || [
    {{ label: 'Research', duration: 'Q1' }},
    {{ label: 'Design', duration: 'Q2' }},
    {{ label: 'Build', duration: 'Q3' }},
    {{ label: 'Launch', duration: 'Q4' }}
  ];
  
  const activeStep = state.activeStep || 0;
  
  React.useEffect(function() {{
    if (isThumbnail) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        return {{ activeStep: ((prev.activeStep || 0) + 1) % steps.length }};
      }});
    }}, 2000);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  const stepWidth = 100 / steps.length;
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '60px',
      fontFamily: 'Inter, sans-serif'
    }}
  }},
    React.createElement('div', {{
      style: {{
        display: 'flex',
        position: 'relative',
        alignItems: 'center',
        marginBottom: '40px'
      }}
    }},
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          top: '24px',
          left: '24px',
          right: '24px',
          height: '4px',
          backgroundColor: '#E5E7EB',
          borderRadius: '2px'
        }}
      }}),
      React.createElement('div', {{
        style: {{
          position: 'absolute',
          top: '24px',
          left: '24px',
          width: (activeStep / (steps.length - 1)) * 100 + '%',
          height: '4px',
          backgroundColor: '{primary}',
          borderRadius: '2px',
          transition: 'width 0.5s ease'
        }}
      }}),
      steps.map(function(step, i) {{
        const isActive = i <= activeStep;
        return React.createElement('div', {{
          key: i,
          style: {{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            zIndex: 1
          }}
        }},
          React.createElement('div', {{
            style: {{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: isActive ? '{primary}' : '#E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '700',
              fontSize: '20px',
              transition: 'all 0.3s ease',
              transform: i === activeStep ? 'scale(1.2)' : 'scale(1)',
              boxShadow: i === activeStep ? '0 4px 20px rgba(59,130,246,0.4)' : 'none'
            }}
          }}, (i + 1).toString()),
          React.createElement('div', {{
            style: {{
              marginTop: '16px',
              fontSize: '18px',
              fontWeight: isActive ? '600' : '400',
              color: isActive ? '{primary}' : '#6B7280',
              transition: 'all 0.3s ease'
            }}
          }}, step.label),
          React.createElement('div', {{
            style: {{
              fontSize: '14px',
              color: '#9CA3AF',
              marginTop: '4px'
            }}
          }}, step.duration)
        );
      }})
    )
  );
}}"""

def get_stat_card_grid_template(theme_colors: dict) -> str:
    """
    Grid of animated stat cards.
    Great for showing multiple metrics with impact.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const stats = props.stats || [
    {{ value: '2.4B', label: 'Market Size', color: '#3B82F6' }},
    {{ value: '135%', label: 'Growth', color: '#8B5CF6' }},
    {{ value: '450+', label: 'Customers', color: '#EC4899' }},
    {{ value: '99.9%', label: 'Uptime', color: '#10B981' }}
  ];
  
  const visible = state.visible || false;
  
  React.useEffect(function() {{
    if (isThumbnail) return;
    setTimeout(function() {{
      updateState({{ visible: true }});
    }}, 100);
  }}, []);
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateColumns: stats.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
      gap: '30px',
      padding: '40px',
      fontFamily: 'Inter, sans-serif'
    }}
  }},
    stats.map(function(stat, i) {{
      return React.createElement('div', {{
        key: i,
        style: {{
          backgroundColor: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.2)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.5s ease',
          transitionDelay: (i * 0.1) + 's'
        }}
      }},
        React.createElement('div', {{
          style: {{
            fontSize: '64px',
            fontWeight: '900',
            color: stat.color,
            lineHeight: '1',
            marginBottom: '16px'
          }}
        }}, stat.value),
        React.createElement('div', {{
          style: {{
            fontSize: '20px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.8)',
            textAlign: 'center'
          }}
        }}, stat.label)
      );
    }})
  );
}}"""

def get_particle_background_template(theme_colors: dict) -> str:
    """
    Animated particle background for visual interest.
    Subtle, not overwhelming.
    """
    primary = theme_colors.get('primary', '#3B82F6')
    
    return f"""function render({{ props, state, updateState, id, isThumbnail }}) {{
  const particleCount = props.particleCount || 30;
  const particles = state.particles || Array.from({{ length: particleCount }}, function(_, i) {{
    return {{
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.3
    }};
  }});
  
  React.useEffect(function() {{
    if (isThumbnail) return;
    const interval = setInterval(function() {{
      updateState(function(prev) {{
        return {{
          particles: (prev.particles || particles).map(function(p) {{
            let newX = p.x + p.speedX;
            let newY = p.y + p.speedY;
            if (newX < 0 || newX > 100) newX = p.x;
            if (newY < 0 || newY > 100) newY = p.y;
            return {{ ...p, x: newX, y: newY }};
          }})
        }};
      }});
    }}, 50);
    return function() {{ clearInterval(interval); }};
  }}, []);
  
  return React.createElement('div', {{
    style: {{
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}
  }},
    particles.map(function(particle, i) {{
      return React.createElement('div', {{
        key: i,
        style: {{
          position: 'absolute',
          left: particle.x + '%',
          top: particle.y + '%',
          width: particle.size + 'px',
          height: particle.size + 'px',
          borderRadius: '50%',
          backgroundColor: '{primary}',
          opacity: particle.opacity,
          transition: 'all 0.05s linear'
        }}
      }});
    }})
  );
}}"""

# Export all templates
CUSTOMCOMPONENT_TEMPLATES = {
    'animated_counter': {
        'description': 'Animated number counter for stat slides',
        'template': get_animated_counter_template,
        'use_cases': ['stat slides', 'metrics', 'KPIs', 'impact numbers'],
        'props': ['targetValue', 'prefix', 'suffix', 'label', 'duration']
    },
    'comparison_slider': {
        'description': 'Interactive before/after comparison',
        'template': get_comparison_slider_template,
        'use_cases': ['comparisons', 'A/B tests', 'improvements', 'transformations'],
        'props': ['leftLabel', 'rightLabel', 'leftValue', 'rightValue', 'metric']
    },
    'progress_timeline': {
        'description': 'Animated timeline showing process steps',
        'template': get_progress_timeline_template,
        'use_cases': ['roadmaps', 'processes', 'timelines', 'milestones'],
        'props': ['steps']
    },
    'stat_card_grid': {
        'description': 'Grid of animated statistic cards',
        'template': get_stat_card_grid_template,
        'use_cases': ['multiple metrics', 'dashboard view', 'overview slides'],
        'props': ['stats']
    },
    'particle_background': {
        'description': 'Subtle animated particle effects',
        'template': get_particle_background_template,
        'use_cases': ['background interest', 'tech themes', 'modern aesthetic'],
        'props': ['particleCount']
    }
}

def get_customcomponent_guidance() -> str:
    """
    Guidance text for when to use CustomComponents and what templates are available.
    """
    guidance = "CUSTOMCOMPONENT TEMPLATES AVAILABLE:\n\n"
    
    for name, info in CUSTOMCOMPONENT_TEMPLATES.items():
        guidance += f"• {name.upper()}\n"
        guidance += f"  Description: {info['description']}\n"
        guidance += f"  Use for: {', '.join(info['use_cases'])}\n"
        guidance += f"  Props: {', '.join(info['props'])}\n\n"
    
    guidance += """
CREATE YOUR OWN CustomComponents for:
- Unique interactive visualizations
- Animated data displays
- Custom chart types
- Interactive storytelling elements

Remember: CustomComponents must use React.createElement (no JSX),
complete function bodies, and proper state management.
"""
    
    return guidance

