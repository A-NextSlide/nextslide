import React from 'react';
import { useVersionHistory } from '../context/VersionHistoryContext';
import { useDeckStore } from '../stores/deckStore';
import { Button } from './ui/button';
import { ArrowLeft, ArrowRight, Plus, Minus, Pencil } from 'lucide-react';

const VersionComparisonView: React.FC = () => {
  const { versionDiff, selectedVersionId, comparisonVersionId, setCompareMode } = useVersionHistory();
  const { versions } = useDeckStore(state => state.versionHistory || { versions: [] });
  const restoreVersion = useDeckStore(state => state.restoreVersion);
  
  // Find version names for display
  const selectedVersion = versions.find(v => v.id === selectedVersionId);
  const comparisonVersion = versions.find(v => v.id === comparisonVersionId);
  
  // Handler to restore a specific version
  const handleRestore = async (versionId: string) => {
    if (!confirm('Are you sure you want to restore this version? Any unsaved changes will be lost.')) {
      return;
    }
    
    const success = await restoreVersion(versionId);
    if (success) {
      alert('Version restored successfully');
      // Exit compare mode after restore
      setCompareMode(false);
    } else {
      alert('Failed to restore version');
    }
  };
  
  if (!versionDiff || !selectedVersion || !comparisonVersion) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center">
        <p className="text-muted-foreground mb-4">Select two versions to compare</p>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setCompareMode(false)}
        >
          Back to Versions
        </Button>
      </div>
    );
  }
  
  // Format dates for better display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const noChangesDetected = 
    versionDiff.addedSlides.length === 0 && 
    versionDiff.removedSlides.length === 0 && 
    versionDiff.modifiedSlides.length === 0 && 
    versionDiff.deckPropertyChanges.length === 0;
  
  return (
    <div className="p-4 overflow-auto h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-base font-semibold">Version Comparison</h2>
          <p className="text-xs text-muted-foreground">
            Showing differences between selected versions
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setCompareMode(false)}
          className="text-xs"
        >
          <ArrowLeft size={14} className="mr-1" /> Back to Versions
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border rounded p-3 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex flex-col">
            <h3 className="text-sm font-medium">{selectedVersion.version_name}</h3>
            <p className="text-xs text-muted-foreground mb-1">
              Version {selectedVersion.version_number} • {formatDate(selectedVersion.created_at)}
            </p>
            {selectedVersion.metadata.description && (
              <p className="text-xs border-t pt-1 mt-1">{selectedVersion.metadata.description}</p>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2 text-xs"
              onClick={() => handleRestore(selectedVersion.id)}
            >
              Restore This Version
            </Button>
          </div>
        </div>
        
        <div className="border rounded p-3 bg-green-50 dark:bg-green-900/20">
          <div className="flex flex-col">
            <h3 className="text-sm font-medium">{comparisonVersion.version_name}</h3>
            <p className="text-xs text-muted-foreground mb-1">
              Version {comparisonVersion.version_number} • {formatDate(comparisonVersion.created_at)}
            </p>
            {comparisonVersion.metadata.description && (
              <p className="text-xs border-t pt-1 mt-1">{comparisonVersion.metadata.description}</p>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2 text-xs"
              onClick={() => handleRestore(comparisonVersion.id)}
            >
              Restore This Version
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {noChangesDetected ? (
          <div className="flex flex-col items-center justify-center text-center p-4 border rounded bg-muted/20">
            <p className="text-sm">No differences detected between these versions</p>
            <p className="text-xs text-muted-foreground mt-1">Try selecting different versions to compare</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Slides Changes */}
            {(versionDiff.addedSlides.length > 0 || versionDiff.removedSlides.length > 0) && (
              <div className="border rounded p-3">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <ArrowRight size={14} className="mr-1" /> Slide Changes
                </h3>
                
                {versionDiff.addedSlides.length > 0 && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center">
                      <Plus size={12} className="mr-1" /> Added Slides ({versionDiff.addedSlides.length})
                    </h4>
                    <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                      {versionDiff.addedSlides.map(id => (
                        <li key={id} className="text-green-600 dark:text-green-400">
                          Slide ID: {id}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {versionDiff.removedSlides.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center">
                      <Minus size={12} className="mr-1" /> Removed Slides ({versionDiff.removedSlides.length})
                    </h4>
                    <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                      {versionDiff.removedSlides.map(id => (
                        <li key={id} className="text-red-600 dark:text-red-400">
                          Slide ID: {id}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Modified Slides */}
            {versionDiff.modifiedSlides.length > 0 && (
              <div className="border rounded p-3">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <Pencil size={14} className="mr-1" /> Modified Slides ({versionDiff.modifiedSlides.length})
                </h3>
                <ul className="space-y-3 text-xs">
                  {versionDiff.modifiedSlides.map(slide => (
                    <li key={slide.slideId} className="border-l-2 border-blue-500 pl-2 py-1 bg-blue-50/30 dark:bg-blue-900/10 rounded-r">
                      <span className="font-medium block mb-1">Slide ID: {slide.slideId}</span>
                      <ul className="pl-2 space-y-2">
                        {slide.addedComponents.length > 0 && (
                          <li className="text-green-600 dark:text-green-400 flex items-start">
                            <Plus size={10} className="mr-1 mt-0.5 flex-shrink-0" />
                            <span>
                              Added {slide.addedComponents.length} component{slide.addedComponents.length > 1 ? 's' : ''}
                              <ul className="pl-3 mt-0.5 text-muted-foreground">
                                {slide.addedComponents.map(id => (
                                  <li key={id} className="truncate">{id}</li>
                                ))}
                              </ul>
                            </span>
                          </li>
                        )}
                        {slide.removedComponents.length > 0 && (
                          <li className="text-red-600 dark:text-red-400 flex items-start">
                            <Minus size={10} className="mr-1 mt-0.5 flex-shrink-0" />
                            <span>
                              Removed {slide.removedComponents.length} component{slide.removedComponents.length > 1 ? 's' : ''}
                              <ul className="pl-3 mt-0.5 text-muted-foreground">
                                {slide.removedComponents.map(id => (
                                  <li key={id} className="truncate">{id}</li>
                                ))}
                              </ul>
                            </span>
                          </li>
                        )}
                        {slide.modifiedComponents.length > 0 && (
                          <li className="text-blue-600 dark:text-blue-400 flex items-start">
                            <Pencil size={10} className="mr-1 mt-0.5 flex-shrink-0" />
                            <span>
                              Modified {slide.modifiedComponents.length} component{slide.modifiedComponents.length > 1 ? 's' : ''}
                              <ul className="pl-3 mt-0.5 text-muted-foreground">
                                {slide.modifiedComponents.map(id => (
                                  <li key={id} className="truncate">{id}</li>
                                ))}
                              </ul>
                            </span>
                          </li>
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Deck Property Changes */}
            {versionDiff.deckPropertyChanges.length > 0 && (
              <div className="border rounded p-3">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <Pencil size={14} className="mr-1" /> Deck Property Changes
                </h3>
                <ul className="space-y-1 pl-2 text-xs">
                  {versionDiff.deckPropertyChanges.map(prop => (
                    <li key={prop} className="text-purple-600 dark:text-purple-400 flex items-center">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                      <span>{prop}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionComparisonView;