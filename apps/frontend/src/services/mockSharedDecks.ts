import { CompleteDeckData } from '@/types/DeckTypes';

// Mock shared decks for demonstration
export const getMockSharedDecks = (): CompleteDeckData[] => {
  return [
    {
      uuid: 'shared-deck-1',
      name: 'Q4 2024 Marketing Strategy',
      slides: [],
      lastModified: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      version: 'v1',
      is_shared: true,
      share_type: 'edit',
      shared_by: {
        id: 'user-123',
        email: 'john.doe@company.com',
        name: 'John Doe'
      },
      shared_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      permissions: ['view', 'edit']
    },
    {
      uuid: 'shared-deck-2',
      name: 'Product Roadmap 2025',
      slides: [],
      lastModified: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      version: 'v1',
      is_shared: true,
      share_type: 'view',
      shared_by: {
        id: 'user-456',
        email: 'jane.smith@company.com',
        name: 'Jane Smith'
      },
      shared_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      permissions: ['view']
    },
    {
      uuid: 'shared-deck-3',
      name: 'Team Training Materials',
      slides: [],
      lastModified: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      version: 'v1',
      is_shared: true,
      share_type: 'edit',
      shared_by: {
        id: 'user-789',
        email: 'manager@company.com',
        name: 'Project Manager'
      },
      shared_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      permissions: ['view', 'edit', 'share']
    }
  ];
}; 