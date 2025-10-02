import puppeteer from 'puppeteer';

const openPage = async (url: string): Promise<void> => {
  // Launch browser in headless mode with anti-detection measures
  const browser = await puppeteer.launch({ 
    headless: 'new', // Use the new headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  
  const page = await browser.newPage();
  
  // Set user agent to a common one
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Mask WebDriver usage
  await page.evaluateOnNewDocument(() => {
    // Overwrite the navigator.webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
    
    // Overwrite chrome object to appear as normal browser
    window.chrome = {
      runtime: {},
      // Add other chrome properties as needed
    };
  });
  
  // Listen for console messages from the page
  page.on('console', message => {
    const type = message.type();
    const text = message.text();
    
    // Format logs based on type
    switch (type) {
      case 'error':
        console.error(`🔴 Page Error: ${text}`);
        // Check for specific error and refresh the page
        if (text.includes("The above error occurred in the <ComponentRenderer> component:")) {
          console.log("🔄 Detected ComponentRenderer error, refreshing page...");
          page.reload({ waitUntil: 'networkidle0' })
            .then(() => console.log("✅ Page refreshed successfully"))
            .catch(err => console.error("❌ Error refreshing page:", err));
        }
        break;
      case 'warning':
        console.warn(`🟠 Page Warning: ${text}`);
        break;
      case 'info':
        console.info(`🔵 Page Info: ${text}`);
        break;
      default:
        console.log(`⚪ Page Log: ${text}`);
    }
  });
  
  // Listen for page errors
  page.on('pageerror', error => {
    console.error(`🔴 Page Error: ${error.message}`);
  });
  
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 30000  // Increased timeout to 30 seconds for React app initialization
  });
  
  console.log(`Page loaded: ${await page.title()}`);
  return browser; // Return browser instance for management
};

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    url: 'https://example.com',
    instances: 1
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--url' && i + 1 < args.length) {
      options.url = args[++i];
    } else if (arg === '--instances' && i + 1 < args.length) {
      const instanceCount = parseInt(args[++i], 10);
      if (!isNaN(instanceCount) && instanceCount > 0) {
        options.instances = instanceCount;
      } else {
        console.warn('Invalid instance count, using default of 1');
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node puppet.js [options]

Options:
  --url <url>           URL to navigate to (default: https://example.com)
  --instances <number>  Number of browser instances to launch (default: 1)
  --help, -h            Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
};

// Main function to handle multiple instances
const main = async (): Promise<void> => {
  // Parse command line arguments
  const options = parseArgs();
  const { url, instances } = options;
  
  console.log(`Launching ${instances} browser instance(s) to ${url}`);
  
  // Track all browser instances
  const browsers = [];
  
  // Launch the specified number of browser instances
  for (let i = 0; i < instances; i++) {
    try {
      console.log(`Launching browser instance ${i + 1}/${instances}`);
      const browser = await openPage(url);
      browsers.push(browser);
      console.log(`Browser instance ${i + 1} launched successfully`);
    } catch (error) {
      console.error(`Error launching browser instance ${i + 1}:`, error);
    }
  }
  
  console.log(`${browsers.length} browser instance(s) running`);
  console.log('Browsers will stay open until you press Ctrl+C in the terminal');
  console.log('Capturing console logs from all pages in real-time...');
  
  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    console.log('Shutting down all browser instances...');
    for (const browser of browsers) {
      await browser.close();
    }
    console.log('All browsers closed');
    process.exit(0);
  });
};

// Run the main function and log any errors
main().catch(error => console.error('Error:', error));