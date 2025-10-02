/**
 * Script to backfill embeddings for existing slide templates
 * 
 * Usage:
 * 1. Make sure you have your environment variables set (OpenAI API key)
 * 2. Run this script with: node scripts/backfill_embeddings.js
 */

// Import required services (adjust paths as needed)
import { SlideTemplateService } from '../src/services/SlideTemplateService.js';

async function backfillEmbeddings() {
  console.log('Starting to backfill embeddings for existing templates...');
  
  try {
    const result = await SlideTemplateService.generateMissingEmbeddings();
    
    if (result.success) {
      console.log('✅ Backfill completed successfully!');
      console.log(`📊 Results:`);
      console.log(`   - Templates processed: ${result.processed}`);
      console.log(`   - Failed: ${result.failed}`);
      
      if (result.processed === 0 && result.failed === 0) {
        console.log('ℹ️  All templates already have embeddings.');
      }
    } else {
      console.error('❌ Backfill failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error running backfill script:', error);
  }
}

// Run the backfill
backfillEmbeddings(); 