import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SlideTemplateService, SlideTemplate } from '@/services/SlideTemplateService';
import { 
  ArrowLeft, 
  Search, 
  Trash2, 
  Loader2, 
  Brain, 
  Calendar,
  Eye,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import SlideComponent from '@/components/Slide';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { NavigationProvider } from '@/context/NavigationContext';
import LoadingDisplay from '@/components/common/LoadingDisplay';

interface TemplateManagerProps {
  onBack: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ onBack }) => {
  const [templates, setTemplates] = useState<SlideTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = useState<SlideTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearchingFor, setIsSearchingFor] = useState<'all' | 'similar' | null>(null);

  // Load templates on component mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await SlideTemplateService.getAllTemplates(100); // Load first 100
      
      if (result.success) {
        setTemplates(result.templates);
      } else {
        setError('Failed to load templates');
      }
    } catch (err) {
      setError('Error loading templates');
      console.error('Error loading templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadTemplates();
      return;
    }

    try {
      setIsLoading(true);
      
      // Use hybrid search for better results (combines vector and text search)
      const result = await SlideTemplateService.hybridSearchTemplates(searchQuery);
      
      if (result.success) {
        setTemplates(result.templates);
        console.log(`Found ${result.templates.length} templates for query: "${searchQuery}"`);
      } else {
        setError('Search failed');
      }
    } catch (err) {
      setError('Search error');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (templateUuid: string) => {
    if (!templateUuid) return;

    try {
      setDeletingIds(prev => new Set(prev).add(templateUuid));
      
      const result = await SlideTemplateService.deleteTemplate(templateUuid);
      
      if (result.success) {
        setTemplates(prev => prev.filter(t => t.uuid !== templateUuid));
        if (selectedTemplate?.uuid === templateUuid) {
          setSelectedTemplate(null);
        }
      } else {
        setError('Failed to delete template');
      }
    } catch (err) {
      setError('Error deleting template');
      console.error('Error deleting template:', err);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(templateUuid);
        return next;
      });
    }
  };

  const createRenderableSlide = (template: SlideTemplate) => {
    if (!template.slides || !Array.isArray(template.slides) || template.slides.length === 0) {
      return null;
    }

    const slideData = template.slides[0]; // Get first slide
    return {
      id: slideData.id || 'preview',
      title: slideData.title || template.name,
      components: slideData.components || [],
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT,
      preview: '',
      thumbnail: ''
    };
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const handleFindSimilar = async (templateUuid: string) => {
    if (!templateUuid) return;

    try {
      setIsLoading(true);
      setIsSearchingFor('similar');
      setError(null);
      
      const result = await SlideTemplateService.findSimilarTemplates(templateUuid, 20);
      
      if (result.success) {
        setTemplates(result.templates);
        console.log(`Found ${result.templates.length} similar templates`);
      } else {
        setError('Failed to find similar templates');
      }
    } catch (err) {
      setError('Error finding similar templates');
      console.error('Error finding similar templates:', err);
    } finally {
      setIsLoading(false);
      setIsSearchingFor(null);
    }
  };
  
  const resetToAllTemplates = () => {
    setSearchQuery('');
    setIsSearchingFor('all');
    loadTemplates();
  };

  if (isLoading && templates.length === 0) {
    return <LoadingDisplay message="Loading templates..." />;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Upload
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Template Manager</h1>
            <p className="text-gray-600">{templates.length} templates available</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="Search templates by name or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Templates</h2>
            {(searchQuery || isSearchingFor === 'similar') && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToAllTemplates}
              >
                Show All Templates
              </Button>
            )}
          </div>
          
          {isSearchingFor === 'similar' && (
            <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
              Showing templates similar to "{selectedTemplate?.name}"
            </div>
          )}

          {templates.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-gray-600">No templates found</p>
              </CardContent>
            </Card>
          ) : (
            templates.map((template) => (
              <Card 
                key={template.uuid} 
                className={`cursor-pointer transition-all ${
                  selectedTemplate?.uuid === template.uuid ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedTemplate(template)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-sm mt-1">
                        {template.description}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.uuid!);
                      }}
                      disabled={deletingIds.has(template.uuid!)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingIds.has(template.uuid!) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Purpose */}
                    <div className="text-sm">
                      <span className="font-medium">Purpose:</span> {template.purpose}
                    </div>
                    
                    {/* AI Tags */}
                    {template.auto_tags && template.auto_tags.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <Brain className="h-3 w-3" />
                          AI Tags
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {template.auto_tags.slice(0, 5).map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {template.auto_tags.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.auto_tags.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Custom Tags */}
                    {template.custom_tags && template.custom_tags.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Custom Tags</div>
                        <div className="flex flex-wrap gap-1">
                          {template.custom_tags.map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Date */}
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created: {formatDate(template.created_at!)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Preview Panel */}
        <div className="lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold mb-4">Preview</h2>
          
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    {selectedTemplate.name}
                  </CardTitle>
                  {selectedTemplate.uuid && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFindSimilar(selectedTemplate.uuid!)}
                      disabled={isLoading}
                      className="flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Find Similar
                    </Button>
                  )}
                </div>
                {selectedTemplate.similarity && (
                  <div className="text-xs text-green-600">
                    Similarity: {(selectedTemplate.similarity * 100).toFixed(1)}%
                    {selectedTemplate.searchType && (
                      <span className="ml-2 text-gray-500">
                        ({selectedTemplate.searchType} search)
                      </span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {createRenderableSlide(selectedTemplate) ? (
                  <div 
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
                      backgroundColor: '#ffffff',
                      border: '1px solid #ccc',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                      margin: '0 auto',
                    }}
                  >
                    <div 
                      style={{
                        width: `${DEFAULT_SLIDE_WIDTH}px`,
                        height: `${DEFAULT_SLIDE_HEIGHT}px`,
                        transformOrigin: 'center center',
                        transform: `scale(${400 / DEFAULT_SLIDE_WIDTH})`,
                        backgroundColor: '#ffffff',
                        position: 'absolute',
                        overflow: 'hidden',
                      }}
                    >
                      <NavigationProvider 
                        initialSlideIndex={0} 
                        onSlideChange={() => {}}
                      >
                        <EditorStateProvider initialEditingState={false}>
                          <ActiveSlideProvider>
                            <SlideComponent
                              slide={createRenderableSlide(selectedTemplate)!}
                              isActive={true}
                              direction={null}
                              isEditing={false}
                              isThumbnail={false}
                            />
                          </ActiveSlideProvider>
                        </EditorStateProvider>
                      </NavigationProvider>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No slide data available for preview
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Eye className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">Select a template to preview</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateManager; 