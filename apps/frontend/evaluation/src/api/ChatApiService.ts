import { DeckDiff, SlideData } from '../types';
import { ApiResponse, QualityEvaluation } from '../experiment/types';
import { Logger, createLoggerWrapper } from '../utils/logging';
// Use import for node-fetch v3
import fetch from 'node-fetch';

/**
 * Configuration for the chat API
 */
export interface ChatApiConfig {
  baseUrl?: string;                     // Base URL for API requests
  mockResponses?: boolean;              // Whether to use mock responses
  maxRetries?: number;                  // Maximum number of retries for API failures (default: 3)
  retryDelayMs?: number;                // Base delay between retries in milliseconds (default: 1000)
  diagnosticMode?: boolean;             // Enable diagnostic logging
  disableNodeFetch?: boolean;           // Disable node-fetch keepalive for connection cleanup
  enableKeepAlive?: boolean;            // Enable HTTP keepalive (not recommended)
}

/**
 * Service for interacting with LLM APIs to generate slide modifications
 */
export class ChatApiService {
  private config: ChatApiConfig;
  
  /**
   * Initialize the chat API service
   * 
   * @param config Configuration for the service
   */
  constructor(config: ChatApiConfig = {}) {
    // Set default configuration values
    this.config = {
      baseUrl: 'http://localhost:9090', // Default local FastAPI server URL
      mockResponses: process.env.NODE_ENV === 'development',
      maxRetries: 3,                    // Default to 3 retries
      retryDelayMs: 1000,               // Default to 1 second between retries
      ...config
    };
    
    // Warn if using mock responses
    if (this.config.mockResponses) {
      console.warn('⚠️ Using mock responses for ChatAPI. Set mockResponses to false for real API calls.');
    }
  }
  
  /**
   * Sleep for a specified number of milliseconds
   * 
   * @param ms Milliseconds to sleep
   * @returns Promise that resolves after the specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate a deck diff for a slide based on a prompt with retry mechanism
   * 
   * @param slides All slides in the deck
   * @param targetSlideId The ID of the slide to modify
   * @param prompt The prompt to send to the API
   * @param logger Optional logger for diagnostics
   * @param run_uuid Optional UUID to track the experiment run
   * @returns Promise resolving to the API response
   */
  async generateDeckDiff(
    slides: SlideData[], 
    targetSlideId: string, 
    prompt: string, 
    logger?: Logger, 
    run_uuid?: string
  ): Promise<ApiResponse> {
    // Create a unique request ID for tracking this request
    const requestId = `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const log = createLoggerWrapper(logger, 'API');
    
    // Find the target slide
    const targetSlide = slides.find(slide => slide.id === targetSlideId);
    if (!targetSlide) {
      throw new Error(`Target slide with ID ${targetSlideId} not found in provided slides`);
    }
    
    // If using mock responses, return a mock response
    if (this.config.mockResponses) {
      log.info(`Creating mock response`);
      return this.createMockResponse(targetSlide, prompt);
    }
    
    // Retry mechanism
    let lastError: Error | null = null;
    let attempt = 0;
    
    while (attempt < (this.config.maxRetries || 3)) {
      attempt++;
      try {
        log.info(`Attempt ${attempt}/${this.config.maxRetries || 3}`);
        const response = await this.makeApiRequest(requestId, slides, targetSlideId, prompt, log, run_uuid);
        
        // If we get here, the request succeeded
        return response;
      } catch (error: any) {
        lastError = error;
        log.error(`API request failed on attempt ${attempt}: ${error.message}`);
        
        // Check if this is our last attempt
        if (attempt >= (this.config.maxRetries || 3)) {
          log.error(`Maximum retry attempts reached. Giving up.`);
          break;
        }
        
        // Exponential backoff: retryDelay * (2^attempt) * (0.5-1.5 random jitter)
        const baseDelay = this.config.retryDelayMs || 1000;
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = 0.5 + Math.random();
        const delay = Math.floor(exponentialDelay * jitter);
        
        log.info(`Waiting ${delay}ms before retry ${attempt + 1}...`);
        await this.sleep(delay);
      }
    }
    
    // If we get here, all retries failed
    if (lastError) {
      throw lastError;
    } else {
      throw new Error(`API request failed after ${this.config.maxRetries} attempts`);
    }
  }
  
  /**
   * Make an API request to generate a deck diff
   * 
   * @param requestId Unique ID for this request
   * @param slides All slides in the deck
   * @param targetSlideId The ID of the slide to modify
   * @param prompt The prompt to send to the API
   * @param logger Optional logger for diagnostics
   * @param run_uuid Optional UUID to track the experiment run
   * @returns Promise resolving to the API response
   */
  private async makeApiRequest(
    requestId: string, 
    slides: SlideData[], 
    targetSlideId: string, 
    prompt: string, 
    logger?: Logger,
    run_uuid?: string
  ): Promise<ApiResponse> {
    const log = createLoggerWrapper(logger, 'API');
    // Keep track of timeout ID for cleanup
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Find the target slide's index
      const targetSlideIndex = slides.findIndex(slide => slide.id === targetSlideId);
      if (targetSlideIndex === -1) {
        throw new Error(`Target slide with ID ${targetSlideId} not found in provided slides`);
      }
      
      // Create a deck structure with all slides
      const deckData = {
        uuid: `temp-deck-${Date.now()}-${Math.floor(Math.random() * 10000)}`, // Ensure unique deck ID
        name: 'Evaluation Deck',
        size: {
          width: 1920,
          height: 1080
        },
        slides: slides,  // Include all slides, not just the target slide
        version: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        components: {},
        styles: {},
        dependencies: {},
        backgroundStyles: {},
        elementStyles: {},
        themeOverrides: {
          darkMode: false
        }
      };
      
      // Create the request payload
      const payload = {
        message: prompt,
        slide_id: targetSlideId,
        current_slide_index: targetSlideIndex,
        deck_data: deckData,
        chat_history: [
          {
            role: 'user',
            content: prompt,
            timestamp: new Date()
          }
        ],
        run_uuid
      };
      
      // Simplified log for API request
      log.info(`Making API request for prompt: "${prompt.substring(0, 50)}..."`);
      
      // Create a promise that will be resolved/rejected based on fetch or timeout
      return await new Promise<ApiResponse>((resolve, reject) => {
        // Make the API request with a timeout
        const controller = new AbortController();
        
        // Setup timeout
        timeoutId = setTimeout(() => {
          log.error(`Request timeout triggered after 120s`);
          controller.abort();
          reject(new Error(`API request timed out after 120 seconds`));
        }, 120000); // 2 minute timeout
        
        // Start the fetch request
        fetch(`${this.config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
        .then((response) => { 
          log.info(`Received response with status: ${response.status}`);
          
          if (!response.ok) {
            return response.text().then((errorText: string) => {
              log.error(`API request failed with status ${response.status}: ${errorText}`);
              throw new Error(`API request failed with status ${response.status}: ${errorText}`);
            });
          }
          
          // Parse the response
          return response.json();
        })
        .then((responseData: any) => {
          // Clear the timeout
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          log.info(`API response received successfully`);

          if (!responseData.deck_diff) {
            responseData.deck_diff = {}
          }
          
          // Minimal logging for empty deck_diff
          if (!responseData.deck_diff || Object.keys(responseData.deck_diff).length === 0) {
            log.warn(`Response has empty deck_diff`);
          }
          
          // Format the response into the expected structure
          const apiResponse: ApiResponse = {
            deckDiff: responseData.deck_diff,
            messages: [responseData.message],
            metadata: {
              timestamp: responseData.timestamp,
              service: 'slide-sorcery-chat-api',
              requestId: requestId
            }
          };
          
          resolve(apiResponse);
        })
        .catch((error: Error) => {
          log.error(`Fetch error: ${error.message}`);
          
          // Clear the timeout if it hasn't fired yet
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (error.name === 'AbortError') {
            reject(new Error(`API request timed out after 120 seconds`));
          } else {
            reject(error);
          }
        });
      });
    } catch (error: unknown) {
      // Clear any remaining timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      log.error(`Error generating deck diff: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Create a mock response for testing
   * 
   * @param slide The slide to modify
   * @param prompt The prompt that was sent
   * @returns A mock API response
   */
  private createMockResponse(slide: SlideData, prompt: string): ApiResponse {
    // Find a text component to modify
    const textComponent = slide.components?.find((c: any) => c.type === 'TextBlock');
    
    // Check if this is the add-title experiment
    const isAddTitleExperiment = prompt.toLowerCase().includes('add a title') && prompt.includes('Welcome to our Presentation');
    
    // Check if this is our multi-slide experiment
    const isMultiSlideExperiment = prompt.toLowerCase().includes('transform this into a 3-slide presentation');
    
    // Create different mock responses based on the experiment type
    let deckDiff: DeckDiff;
    let messages: string[];
    
    if (isMultiSlideExperiment) {
      // For the multi-slide experiment, create a DeckDiff that adds two new slides
      deckDiff = {
        // Update the existing slide to make it the second slide
        slides_to_update: [
          {
            slide_id: slide.id,
            components_to_update: textComponent ? [
              {
                id: textComponent.id,
                props: {
                  text: "Main Content: Key Points & Information",
                  fontSize: 40,
                  textColor: '#2980b9',
                  fontWeight: 'bold'
                }
              }
            ] : [],
            slide_properties: {
              title: "Main Content Slide"
            }
          }
        ],
        // Add two new slides (a title slide and a conclusion slide)
        slides_to_add: [
          {
            id: "slide-intro",
            title: "Title Slide",
            components: [
              {
                id: "title-text",
                type: "TextBlock",
                props: {
                  position: { x: 480, y: 400 },
                  width: 960,
                  height: 120,
                  text: "Welcome to Our Presentation",
                  fontSize: 64,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  textColor: '#e74c3c'
                }
              },
              {
                id: "subtitle-text",
                type: "TextBlock",
                props: {
                  position: { x: 480, y: 550 },
                  width: 960,
                  height: 80,
                  text: "Created for Slide Sorcery Demo",
                  fontSize: 36,
                  fontWeight: 'normal',
                  textAlign: 'center',
                  textColor: '#7f8c8d'
                }
              }
            ]
          },
          {
            id: "slide-conclusion",
            title: "Conclusion Slide",
            components: [
              {
                id: "conclusion-title",
                type: "TextBlock",
                props: {
                  position: { x: 480, y: 200 },
                  width: 960,
                  height: 80,
                  text: "Thank You!",
                  fontSize: 60,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  textColor: '#27ae60'
                }
              },
              {
                id: "conclusion-points",
                type: "TextBlock",
                props: {
                  position: { x: 480, y: 400 },
                  width: 960,
                  height: 300,
                  text: "• We hope you enjoyed this presentation\n• Questions and feedback are welcome\n• Contact us for more information",
                  fontSize: 32,
                  fontWeight: 'normal',
                  textAlign: 'left',
                  textColor: '#34495e'
                }
              }
            ]
          }
        ]
      };
      
      messages = [
        "I've transformed this into a 3-slide presentation as requested:",
        "1. Created a new title slide at the beginning with a welcoming title and subtitle",
        "2. Enhanced the existing slide as the main content slide with improved formatting",
        "3. Added a conclusion slide at the end with a thank you message and bullet points",
        "The slides now flow naturally from introduction to content to conclusion."
      ];
    } else if (isAddTitleExperiment) {
      // Existing add-title experiment logic
      deckDiff = {
        slides_to_update: [
          {
            slide_id: slide.id,
            components_to_update: [],
            components_to_add: [
              {
                id: 'title-1',
                type: 'TextBlock',
                props: {
                  position: { x: 600, y: 80 },
                  width: 720,
                  height: 80,
                  text: 'Welcome to our Presentation',
                  fontSize: 48,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  textColor: '#2c3e50'
                }
              }
            ]
          }
        ]
      };
      
      messages = [
        `I've added a title to the top of the slide that says "Welcome to our Presentation" as requested. The title is positioned near the top center of the slide (at y=80 from the top) with appropriate formatting:`,
        `- Created a new TextBlock component with ID "title-1"`,
        `- Positioned it at coordinates (x=600, y=80)`,
        `- Set the width to 720 pixels and height to 80 pixels`,
        `- Used a larger font size (48px) and bold styling to make it stand out as a title`,
        `- Set the text alignment to center for proper presentation`
      ];
    } else {
      // Default experiment logic
      deckDiff = {
        slides_to_update: [
          {
            slide_id: slide.id,
            components_to_update: textComponent ? [
              {
                id: textComponent.id,
                props: {
                  text: `Modified text based on: "${prompt}"`,
                  textColor: this.getRandomColor(),
                  fontSize: Math.floor(Math.random() * 20) + 36
                }
              }
            ] : [],
            components_to_add: !textComponent ? [
              {
                id: `text-${Date.now()}`,
                type: 'TextBlock',
                props: {
                  position: { x: 200, y: 200 },
                  width: 600,
                  height: 200,
                  text: `Added text based on: "${prompt}"`,
                  fontSize: 48,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  textColor: this.getRandomColor()
                }
              }
            ] : []
          }
        ]
      };
      
      messages = [
        `I've processed your request: "${prompt}"`,
        'I have analyzed the slide and made the following changes:',
        textComponent 
          ? '1. Updated the text content and styling of the existing text component' 
          : '1. Added a new text component with your requested content',
        '2. Adjusted the colors to be more visually appealing',
        '3. Updated the font size for better readability'
      ];
    }
    
    // Create mock metadata without the model property
    const metadata = {
      promptTokens: Math.floor(Math.random() * 500) + 300,
      completionTokens: Math.floor(Math.random() * 400) + 200,
      totalTokens: Math.floor(Math.random() * 900) + 500,
      processingTime: `${(Math.random() * 2 + 0.5).toFixed(1)}s`,
      mockResponse: true
    };
    
    // Return the mock response
    return {
      deckDiff,
      messages,
      metadata
    };
  }
  
  /**
   * Generate a random color
   * 
   * @returns A random color in hex format
   */
  private getRandomColor(): string {
    const colors = [
      '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', 
      '#536DFE', '#448AFF', '#40C4FF', '#18FFFF', 
      '#64FFDA', '#69F0AE', '#B2FF59', '#EEFF41', 
      '#FFFF00', '#FFD740', '#FFAB40', '#FF6E40'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Evaluate the quality of an experiment result using an LLM via backend API
   * 
   * @param params Parameters for the evaluation, now accepts base64 images
   * @returns Promise resolving to the quality evaluation
   */
  async evaluateQuality(params: {
    prompt: string;                // The original prompt
    beforeDeckSlides: SlideData[]; // All slides before changes
    afterDeckSlides: SlideData[];  // All slides after changes
    deckDiff: DeckDiff;            // The deck diff that was applied
    beforeHtml?: string;           // Optional rendered HTML of all before slides
    afterHtml?: string;            // Optional rendered HTML of all after slides
    beforeImages?: string[];       // Optional base64 encoded images of the before state
    afterImages?: string[];        // Optional base64 encoded images of the after state
    logger?: Logger;               // Optional logger for capturing log messages
    run_uuid?: string;             // Optional run UUID to track the run
  }): Promise<QualityEvaluation> {
    const { 
      prompt, 
      beforeDeckSlides, 
      afterDeckSlides, 
      deckDiff, 
      beforeHtml, 
      afterHtml,
      beforeImages, // Use base64 image arrays
      afterImages,  // Use base64 image arrays
      logger,       // Optional logger
      run_uuid      // Optional run UUID
    } = params;
    
    // Create a logger wrapper that either uses the provided logger or falls back to console
    const log = createLoggerWrapper(logger, 'QualityEval');
    
    // Create a unique request ID for tracking this evaluation
    const requestId = `eval-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    log.info(`Starting quality evaluation for prompt: "${prompt.substring(0, 30)}..."`);
    
    // If using mock responses, return a mock evaluation
    if (this.config.mockResponses) {
      log.info(`Using mock quality evaluation`);
      return this.createMockQualityEvaluation(prompt);
    }
    
    // Keep track of timeout ID for cleanup
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // We now use the base64 image arrays directly instead of file paths
      // So we don't need to read and convert any image paths
      const payload = {
        user_query: prompt,
        before_html: beforeHtml,
        after_html: afterHtml,
        before_deck: { slides: beforeDeckSlides },
        after_deck: { slides: afterDeckSlides },
        deck_diff: deckDiff,
        before_images: beforeImages, // Pass the base64 image array directly
        after_images: afterImages,    // Pass the base64 image array directly
        run_uuid                     // Pass the run UUID if provided
      };
      
      log.info(`Making quality evaluation API request with ${beforeImages?.length || 0} before images, ${afterImages?.length || 0} after images`);
      
      // Make the API request with a timeout
      return await new Promise<QualityEvaluation>((resolve, reject) => {
        // Setup timeout (120 seconds for evaluation)
        timeoutId = setTimeout(() => {
          log.error(`Evaluation request timeout triggered after 120s`);
          reject(new Error(`Evaluation API request timed out after 120 seconds`));
        }, 120000);
        
        // Make the API request to the backend quality-evaluate endpoint
        fetch(`${this.config.baseUrl}/api/quality-evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        })
        .then((response) => { 
          log.info(`Received evaluation response with status: ${response.status}`);
          
          if (!response.ok) {
            return response.text().then((errorText: string) => {
              log.error(`Evaluation API request failed with status ${response.status}: ${errorText}`);
              throw new Error(`Evaluation API request failed with status ${response.status}: ${errorText}`);
            });
          }
          
          // Parse the response
          return response.json();
        })
        .then((data: any) => {
          // Clear the timeout
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          log.info(`Evaluation response received and parsed`);
          
          try {
            // Format the evaluation result from the backend API
            const evaluation: QualityEvaluation = {
              score: data.quality_score,
              explanation: data.explanation,
              metadata: {
                positives: data.strengths,
                negatives: data.areas_for_improvement,
                service: 'quality-evaluate-backend',
                requestId: requestId
              }
            };
            
            log.info(`Quality score: ${evaluation.score}/5`);
            resolve(evaluation);
          } catch (error) {
            log.error(`Error parsing evaluation response: ${error}`);
            reject(error);
          }
        })
        .catch((error: Error) => {
          log.error(`Evaluation request error: ${error.message}`);
          
          // Clear the timeout if it hasn't fired yet
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          reject(error);
        });
      });
    } catch (error: unknown) {
      // Clear any remaining timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      log.error(`Error in quality evaluation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Create a mock quality evaluation for testing
   * 
   * @param prompt The prompt that was evaluated
   * @returns A mock quality evaluation
   */
  private createMockQualityEvaluation(prompt: string): QualityEvaluation {
    // Generate a random score biased toward higher scores
    const score = Math.min(5, Math.max(1, Math.floor(Math.random() * 2) + 3));
    
    const explanations = [
      "The changes directly addressed the user's request by adding the requested elements with good positioning and styling.",
      "The modifications successfully implemented the requested changes but could have been more visually appealing.",
      "The implementation follows the user's request but lacks some polish in terms of layout and design.",
      "The changes meet the basic requirements of the prompt but could be improved with better spacing and typography.",
      "The implementation excellently fulfills the user's request with high-quality visual design and proper positioning."
    ];
    
    const positives = [
      "Successfully added all requested elements",
      "Good use of color contrast",
      "Clear text hierarchy",
      "Proper element positioning",
      "Effective use of available space"
    ];
    
    const negatives = [
      "Could improve text alignment",
      "Font sizes could be more consistent",
      "Spacing between elements could be better",
      "Color choices could be more harmonious",
      "Layout could be more balanced"
    ];
    
    // Pick 2-3 random positives and negatives
    const selectedPositives = positives
      .sort(() => 0.5 - Math.random())
      .slice(0, 2 + Math.floor(Math.random() * 2));
      
    const selectedNegatives = negatives
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(5 - score, 2));
    
    return {
      score,
      explanation: explanations[Math.floor(Math.random() * explanations.length)],
      metadata: {
        positives: selectedPositives,
        negatives: selectedNegatives,
        service: 'mock-evaluator',
        requestId: `mock-${Date.now()}`
      }
    };
  }

  /**
   * Check if the API endpoint is healthy and ready to serve requests
   * 
   * @returns Promise resolving to true if the API is healthy, false otherwise
   */
  async checkHealth(logger?: Logger): Promise<boolean> {
    const log = createLoggerWrapper(logger, 'HealthCheck');
    
    try {
      log.info(`Checking API health at: ${this.config.baseUrl}/api/health`);
      
      // Return true immediately if mock responses are enabled
      if (this.config.mockResponses) {
        log.info('Mock responses enabled, skipping health check');
        return true;
      }

      // For diagnostics, examine the fetch implementation
      log.info(`=== FETCH DIAGNOSTICS ===`);
      try {
        log.info(`Node-fetch version: ${(fetch as any).VERSION || 'Unknown'}`);
        log.info(`Fetch implementation: ${fetch.name} (${typeof fetch})`);
        
        // Log if fetch is using keep-alive by default
        const defaultOptions = {
          agent: (url: string) => {
            // Check if URL is http or https
            if (url.startsWith('https')) {
              return new (require('https').Agent)({ keepAlive: true });
            } else {
              return new (require('http').Agent)({ keepAlive: true });
            }
          }
        };
        
        log.info('Using custom diagnostic fetch options to test agent configuration');
      } catch (fetchDiagError) {
        log.error(`Error during fetch diagnostics: ${fetchDiagError instanceof Error ? fetchDiagError.message : String(fetchDiagError)}`);
      }
      log.info(`=== END FETCH DIAGNOSTICS ===`);

      // Make a simple GET request to the health endpoint with explicit agent options
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        log.error('Health check timeout after 10 seconds');
      }, 10000); // 10 second timeout
      
      log.info('Sending health check request with explicit connection: close header');
      const response = await fetch(`${this.config.baseUrl}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'close' // Request connection close explicitly
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        log.error(`API health check failed with status: ${response.status}`);
        return false;
      }
      
      // Parse the response
      const data = await response.json();
      
      // Explicitly consume and close the body
      await response.text().catch(() => {}); // Ignore errors, just trying to consume
      
      if (typeof data === 'object' && data !== null && 'status' in data && 'registry_loaded' in data) {
        if (data.status === 'healthy' && data.registry_loaded) {
          log.info('API endpoint is healthy and registry is loaded.');
          return true;
        } else {
          log.warn(`API status issues: status=${data.status}, registry_loaded=${data.registry_loaded}`);
          return false;
        }
      } else {
        log.warn('API returned unexpected health check response format');
        return false;
      }
    } catch (error) {
      log.error(`API health check failed with error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}