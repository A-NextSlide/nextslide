/**
 * Test utilities for custom component optimization
 */
import { CustomComponentOptimizationService } from '@/services/CustomComponentOptimizationService';
import { useDeckStore } from '@/stores/deckStore';
import { useEditorStore } from '@/stores/editorStore';

// Make test utilities available globally in development
if (import.meta.env.DEV) {
  (window as any).testCustomComponentOptimization = {
    // Check if optimization is needed
    checkNeeded: async () => {
      const needed = await CustomComponentOptimizationService.checkIfOptimizationNeeded();
      console.log('[CustomComponentOptimization] Optimization needed:', needed);
      return needed;
    },
    
    // Run optimization on current deck
    optimizeDeck: async () => {
      const navigateToSlide = (index: number) => {
        window.dispatchEvent(new CustomEvent('slide:navigate:index', { 
          detail: { index } 
        }));
      };
      
      console.log('[CustomComponentOptimization] Starting test optimization...');
      const result = await CustomComponentOptimizationService.optimizeDeckWithNavigation(
        navigateToSlide,
        true,
        (current, total) => {
          console.log(`[CustomComponentOptimization] Progress: ${current}/${total}`);
        }
      );
      
      console.log('[CustomComponentOptimization] Result:', result);
      return result;
    },
    
    // Add a test chart that's too big
    addOversizedChart: () => {
      const currentSlide = useEditorStore.getState().currentSlide;
      const addComponent = useEditorStore.getState().addComponent;
      
      if (!currentSlide) {
        console.error('No current slide');
        return;
      }
      
      // Create an oversized chart
      addComponent({
        type: 'Chart',
        props: {
          x: 100,
          y: 100,
          width: 800, // Very wide
          height: 600, // Very tall
          chartType: 'bar',
          data: [
            { id: 'Category A', label: 'Category A', value: 100 },
            { id: 'Category B', label: 'Category B', value: 150 },
            { id: 'Category C', label: 'Category C', value: 200 },
            { id: 'Category D', label: 'Category D', value: 250 },
            { id: 'Category E', label: 'Category E', value: 300 }
          ],
          margin: { top: 40, right: 40, bottom: 60, left: 60 } // Large margins
        }
      } as any);
      
      console.log('[CustomComponentOptimization] Added oversized chart');
    },
    
    // Add a test custom component that's too big
    addOversizedCustomComponent: () => {
      const currentSlide = useEditorStore.getState().currentSlide;
      const addComponent = useEditorStore.getState().addComponent;
      
      if (!currentSlide) {
        console.error('No current slide');
        return;
      }
      
      // Create an oversized custom component
      addComponent({
        type: 'CustomComponent',
        props: {
          x: 50,
          y: 50,
          width: 400,
          height: 300,
          render: `function render({ props, state, updateState, isThumbnail, containerWidth, containerHeight }) {
  // This component intentionally creates content larger than its container
  return React.createElement('div', {
    style: {
      width: '600px', // Larger than container
      height: '400px', // Larger than container
      background: 'linear-gradient(45deg, #3498db, #2ecc71)',
      padding: '40px',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '24px',
      fontWeight: 'bold',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }
  },
    React.createElement('h2', { style: { marginBottom: '20px' } }, 'Oversized Component'),
    React.createElement('p', { style: { fontSize: '16px' } }, 
      'Width: 600px (Container: ' + containerWidth + 'px)'),
    React.createElement('p', { style: { fontSize: '16px' } }, 
      'Height: 400px (Container: ' + containerHeight + 'px)'),
    React.createElement('button', {
      style: {
        marginTop: '20px',
        padding: '10px 20px',
        fontSize: '16px',
        backgroundColor: 'white',
        color: '#3498db',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
      },
      onClick: () => updateState({ clicked: true })
    }, state.clicked ? 'Clicked!' : 'Click Me')
  );
}`
        }
      } as any);
      
      console.log('[CustomComponentOptimization] Added oversized custom component');
    },
    
    // Clear optimization from a component
    clearOptimization: (componentId: string) => {
      const updateComponent = useEditorStore.getState().updateComponent;
      updateComponent(componentId, { _optimizedScale: undefined });
      console.log(`[CustomComponentOptimization] Cleared optimization from component ${componentId}`);
    },
    
    // Get optimization info for all components
    getOptimizationInfo: () => {
      const deckData = useDeckStore.getState().deckData;
      const info: any[] = [];
      
      deckData.slides?.forEach((slide: any, slideIndex: number) => {
        slide.components?.forEach((component: any) => {
          if (component.props?._optimizedScale) {
            info.push({
              slideIndex,
              componentId: component.id,
              componentType: component.type,
              scale: component.props._optimizedScale
            });
          }
        });
      });
      
      console.table(info);
      return info;
    }
  };
  
  console.log('[CustomComponentOptimization] Test utilities loaded. Available at window.testCustomComponentOptimization');
}
