import React, { useState, useEffect } from 'react';
import { adminApi, Brand } from '@/services/adminApi';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Palette, Trash2, Edit, Save, X, CheckCircle, XCircle, Plus, Code, Upload, Download, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminBrands: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editedData, setEditedData] = useState<string>('');
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [editedFonts, setEditedFonts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Brand | null>(null);
  const [uploadingBrand, setUploadingBrand] = useState<Brand | null>(null);
  const [fontFiles, setFontFiles] = useState<File[]>([]);
  const [fontFamilyName, setFontFamilyName] = useState('');
  const [uploading, setUploading] = useState(false);

  const pageSize = 50;
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset when search changes
    setBrands([]);
    setCurrentPage(1);
    setHasMore(true);
    loadBrands(1);
  }, [searchQuery]);

  const loadBrands = async (page: number = currentPage) => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await adminApi.getBrands({
        page,
        limit: pageSize,
        search: searchQuery || undefined,
      });

      if (page === 1) {
        setBrands(response.brands);
      } else {
        setBrands(prev => [...prev, ...response.brands]);
      }

      setTotal(response.total);
      setHasMore(response.brands.length === pageSize);
    } catch (error) {
      console.error('Error loading brands:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !loading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadBrands(nextPage);
    }
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setEditedData(JSON.stringify(brand.api_response, null, 2));
    setEditedColors(getColorArray(brand));
    setEditedFonts(getFonts(brand));
  };

  const handleSave = async () => {
    if (!editingBrand) return;

    setSaving(true);
    try {
      // Parse the JSON data
      const parsedData = JSON.parse(editedData);

      // Update colors in the parsed data
      if (!parsedData.colors) parsedData.colors = {};
      parsedData.colors.primary = editedColors.map(hex => ({ hex, type: 'primary' }));

      // Update fonts in the parsed data
      if (editedFonts.length > 0) {
        parsedData.fonts = { names: editedFonts };
      }

      await adminApi.updateBrand(editingBrand.id, parsedData);
      setEditingBrand(null);
      loadBrands();
    } catch (error) {
      console.error('Error saving brand:', error);
      alert('Error saving brand. Please check the JSON format.');
    } finally {
      setSaving(false);
    }
  };

  const handleColorChange = (index: number, newColor: string) => {
    const updated = [...editedColors];
    updated[index] = newColor;
    setEditedColors(updated);
  };

  const handleAddColor = () => {
    setEditedColors([...editedColors, '#000000']);
  };

  const handleRemoveColor = (index: number) => {
    setEditedColors(editedColors.filter((_, i) => i !== index));
  };

  const handleFontChange = (index: number, newFont: string) => {
    const updated = [...editedFonts];
    updated[index] = newFont;
    setEditedFonts(updated);
  };

  const handleAddFont = () => {
    setEditedFonts([...editedFonts, 'Arial']);
  };

  const handleRemoveFont = (index: number) => {
    setEditedFonts(editedFonts.filter((_, i) => i !== index));
  };

  const handleDelete = async (brand: Brand) => {
    try {
      await adminApi.deleteBrand(brand.id);
      setDeleteConfirm(null);
      // Remove from local state instead of reloading
      setBrands(prev => prev.filter(b => b.id !== brand.id));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('Error deleting brand:', error);
      alert('Error deleting brand');
    }
  };

  const getColorArray = (brand: Brand): string[] => {
    const colors: string[] = [];
    const apiResponse = brand.api_response;

    // Helper to extract colors from various formats
    const extractColors = (colorData: any) => {
      if (!colorData) return;

      if (Array.isArray(colorData)) {
        colorData.forEach((color: any) => {
          if (typeof color === 'string') {
            if (!colors.includes(color)) colors.push(color);
          } else if (color?.hex && !colors.includes(color.hex)) {
            colors.push(color.hex);
          }
        });
      } else if (typeof colorData === 'object') {
        // Check all properties for color arrays
        Object.values(colorData).forEach(value => {
          if (Array.isArray(value)) {
            value.forEach((color: any) => {
              if (typeof color === 'string') {
                if (!colors.includes(color)) colors.push(color);
              } else if (color?.hex && !colors.includes(color.hex)) {
                colors.push(color.hex);
              }
            });
          }
        });
      }
    };

    // Extract from all color categories
    if (apiResponse?.colors) {
      extractColors(apiResponse.colors);
    }

    return colors.slice(0, 12); // Show up to 12 colors
  };

  const getFonts = (brand: Brand): string[] => {
    const fonts: string[] = [];
    const apiResponse = brand.api_response;

    if (apiResponse?.fonts) {
      if (Array.isArray(apiResponse.fonts)) {
        apiResponse.fonts.forEach((font: any) => {
          if (typeof font === 'string') {
            fonts.push(font);
          } else if (font?.name) {
            fonts.push(font.name);
          }
        });
      } else if (apiResponse.fonts?.names && Array.isArray(apiResponse.fonts.names)) {
        fonts.push(...apiResponse.fonts.names);
      }
    }

    return fonts;
  };

  const getUploadedFontFiles = (brand: Brand): Array<{ name: string; variants: Record<string, string> }> => {
    const apiResponse = brand.api_response;
    return apiResponse?.fonts?.files || [];
  };

  const hasUploadedFonts = (brand: Brand): boolean => {
    const files = getUploadedFontFiles(brand);
    return files.length > 0 && Object.keys(files[0]?.variants || {}).length > 0;
  };

  const detectVariantFromFilename = (filename: string): string => {
    const lower = filename.toLowerCase();

    // Check for combined variants first
    if (lower.includes('bolditalic') || lower.includes('bold-italic') || lower.includes('bold_italic')) {
      return 'bold-italic';
    }

    // Then check for individual variants
    if (lower.includes('bold') || lower.includes('bd')) return 'bold';
    if (lower.includes('italic') || lower.includes('it') || lower.includes('oblique')) return 'italic';
    if (lower.includes('light') || lower.includes('lt')) return 'light';
    if (lower.includes('thin')) return 'thin';
    if (lower.includes('medium') || lower.includes('md')) return 'medium';
    if (lower.includes('semibold') || lower.includes('semi-bold')) return 'semibold';
    if (lower.includes('extrabold') || lower.includes('extra-bold')) return 'extrabold';
    if (lower.includes('black')) return 'black';
    if (lower.includes('regular') || lower.includes('normal') || lower.includes('book')) return 'regular';

    // Default to regular if no variant detected
    return 'regular';
  };

  const handleFontUpload = async () => {
    if (!uploadingBrand || fontFiles.length === 0 || !fontFamilyName.trim()) {
      alert('Please provide font family name and select files');
      return;
    }

    setUploading(true);
    try {
      let successCount = 0;
      for (const file of fontFiles) {
        const variant = detectVariantFromFilename(file.name);
        try {
          await adminApi.uploadBrandFont(uploadingBrand.id, fontFamilyName, variant, file);
          successCount++;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
        }
      }

      alert(`Successfully uploaded ${successCount} of ${fontFiles.length} font files`);
      setUploadingBrand(null);
      setFontFiles([]);
      setFontFamilyName('');
      loadBrands(1);
    } catch (error) {
      console.error('Error uploading fonts:', error);
      alert('Error uploading fonts');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFontVariant = async (brand: Brand, fontName: string, variant: string) => {
    if (!confirm(`Delete ${fontName} - ${variant}?`)) return;

    try {
      await adminApi.deleteBrandFont(brand.id, fontName, variant);
      // Update local state
      setBrands(prev => prev.map(b => {
        if (b.id === brand.id) {
          const updated = { ...b };
          const files = updated.api_response?.fonts?.files || [];
          const fontEntry = files.find((f: any) => f.name === fontName);
          if (fontEntry?.variants) {
            delete fontEntry.variants[variant];
            if (Object.keys(fontEntry.variants).length === 0) {
              updated.api_response.fonts.files = files.filter((f: any) => f.name !== fontName);
            }
          }
          return updated;
        }
        return b;
      }));
    } catch (error) {
      console.error('Error deleting font variant:', error);
      alert('Error deleting font variant');
    }
  };

  return (
    <AdminLayoutV2>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Brand Cache Management</h1>
            <p className="text-muted-foreground mt-2">
              Manage cached brand data from Brandfetch API
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {total} brands cached
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search brands by name or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Brands Table */}
        <Card className="overflow-hidden">
          <ScrollArea className="h-[calc(100vh-280px)]" onScrollCapture={handleScroll}>
            <div className="min-w-[1000px]">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-muted/50 backdrop-blur border-b">
                <div className="grid grid-cols-[minmax(180px,200px)_minmax(130px,150px)_minmax(200px,1fr)_minmax(180px,200px)_minmax(100px,120px)_100px] gap-4 px-4 py-3 text-sm font-semibold">
                  <div>Brand</div>
                  <div>Domain</div>
                  <div>Colors</div>
                  <div>Fonts</div>
                  <div>Usage</div>
                  <div className="text-right">Actions</div>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y">
                {brands.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Palette className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No brands found</h3>
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'Try adjusting your search query' : 'No brands cached yet'}
                    </p>
                  </div>
                ) : (
                  brands.map((brand) => {
                    const colors = getColorArray(brand);
                    const fonts = getFonts(brand);
                    const brandName = brand.api_response?.brand_name || brand.identifier;
                    const domain = brand.api_response?.domain || brand.normalized_identifier;

                    return (
                      <div
                        key={brand.id}
                        className="grid grid-cols-[minmax(180px,200px)_minmax(130px,150px)_minmax(200px,1fr)_minmax(180px,200px)_minmax(100px,120px)_100px] gap-4 px-4 py-3 hover:bg-muted/30 transition-colors items-center"
                      >
                        {/* Brand Name */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{brandName}</div>
                            <Badge variant={brand.success ? 'outline' : 'destructive'} className="text-xs mt-1">
                              {brand.success ? (
                                <CheckCircle className="h-2 w-2 mr-1" />
                              ) : (
                                <XCircle className="h-2 w-2 mr-1" />
                              )}
                              {brand.success ? 'Active' : 'Failed'}
                            </Badge>
                          </div>
                        </div>

                        {/* Domain */}
                        <div className="text-sm text-muted-foreground truncate" title={domain}>
                          {domain}
                        </div>

                        {/* Colors */}
                        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-1">
                          {colors.length > 0 ? (
                            colors.map((color, idx) => (
                              <div
                                key={idx}
                                className="group relative flex-shrink-0"
                                title={color}
                              >
                                <div
                                  className="w-6 h-6 rounded border border-gray-300 cursor-pointer hover:scale-125 transition-transform"
                                  style={{ backgroundColor: color }}
                                />
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No colors</span>
                          )}
                        </div>

                        {/* Fonts */}
                        <div className="space-y-1">
                          {(() => {
                            const uploadedFonts = getUploadedFontFiles(brand);
                            const fontNames = getFonts(brand);

                            if (uploadedFonts.length > 0) {
                              return (
                                <div className="space-y-1">
                                  {uploadedFonts.map((font, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700">
                                        <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                                        <span className="text-xs font-medium text-green-900 dark:text-green-100">
                                          {font.name}
                                        </span>
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {Object.keys(font.variants).length} files
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              );
                            } else if (fontNames.length > 0) {
                              return (
                                <div className="space-y-1">
                                  {fontNames.slice(0, 2).map((fontName, idx) => (
                                    <div key={idx} className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                                      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                      <span className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                        {fontName}
                                      </span>
                                      <span className="text-xs text-amber-600 dark:text-amber-400">
                                        (no files)
                                      </span>
                                    </div>
                                  ))}
                                  {fontNames.length > 2 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{fontNames.length - 2} more
                                    </span>
                                  )}
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                  <XCircle className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                                    No fonts defined
                                  </span>
                                </div>
                              );
                            }
                          })()}
                        </div>

                        {/* Usage Stats */}
                        <div className="text-xs text-muted-foreground">
                          <div>{brand.hit_count} hits</div>
                          <div>{new Date(brand.last_accessed_at).toLocaleDateString()}</div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setUploadingBrand(brand);
                              setFontFamilyName(brand.api_response?.brand_name || '');
                            }}
                            className="h-8 px-2"
                            title="Upload fonts"
                          >
                            <Upload className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(brand)}
                            className="h-8 px-2"
                            title="Edit brand"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteConfirm(brand);
                            }}
                            className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete brand"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Loading indicator */}
                {loading && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Loading more brands...
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingBrand} onOpenChange={() => setEditingBrand(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Brand Data</DialogTitle>
            <DialogDescription>
              Edit colors, fonts, and raw JSON for {editingBrand?.api_response?.brand_name || editingBrand?.identifier}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="visual" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="visual">
                <Palette className="h-4 w-4 mr-2" />
                Visual Editor
              </TabsTrigger>
              <TabsTrigger value="json">
                <Code className="h-4 w-4 mr-2" />
                JSON Editor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Colors Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-lg font-semibold">Brand Colors</Label>
                      <Button size="sm" variant="outline" onClick={handleAddColor}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Color
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {editedColors.map((color, index) => (
                        <div key={index} className="space-y-2">
                          <div className="relative">
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={color}
                                onChange={(e) => handleColorChange(index, e.target.value)}
                                className="w-16 h-16 rounded-lg border-2 border-gray-300 cursor-pointer"
                              />
                              <div className="flex-1">
                                <Input
                                  value={color}
                                  onChange={(e) => handleColorChange(index, e.target.value.toUpperCase())}
                                  placeholder="#000000"
                                  className="font-mono text-sm"
                                  maxLength={7}
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveColor(index)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fonts Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-lg font-semibold">Brand Fonts</Label>
                      <Button size="sm" variant="outline" onClick={handleAddFont}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Font
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {editedFonts.map((font, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={font}
                            onChange={(e) => handleFontChange(index, e.target.value)}
                            placeholder="Font name"
                            className="flex-1 font-mono"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveFont(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {editedFonts.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No fonts defined</p>
                      )}
                    </div>
                  </div>

                  {/* Brand Info */}
                  <div>
                    <Label className="text-lg font-semibold mb-3 block">Brand Information</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Brand Name</Label>
                        <p className="font-medium">{editingBrand?.api_response?.brand_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Domain</Label>
                        <p className="font-medium">{editingBrand?.api_response?.domain || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="json" className="flex-1 min-h-0 mt-4">
              <div className="h-[500px] flex flex-col">
                <Label htmlFor="brand-data" className="mb-2">API Response JSON</Label>
                <ScrollArea className="flex-1 border rounded-md">
                  <Textarea
                    id="brand-data"
                    value={editedData}
                    onChange={(e) => setEditedData(e.target.value)}
                    className="font-mono text-xs min-h-[480px] border-0 focus-visible:ring-0"
                    placeholder="Paste JSON data here..."
                  />
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingBrand(null)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Brand</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the brand cache for{' '}
              <strong>{deleteConfirm?.api_response?.brand_name || deleteConfirm?.identifier}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Font Upload Dialog */}
      <Dialog open={!!uploadingBrand} onOpenChange={() => {
        setUploadingBrand(null);
        setFontFiles([]);
        setFontFamilyName('');
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Brand Fonts</DialogTitle>
            <DialogDescription>
              Upload font files for {uploadingBrand?.api_response?.brand_name || uploadingBrand?.identifier}.
              Select multiple files for batch upload - variants will be auto-detected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Font Family Name */}
            <div>
              <Label htmlFor="font-family-name">Font Family Name</Label>
              <Input
                id="font-family-name"
                value={fontFamilyName}
                onChange={(e) => setFontFamilyName(e.target.value)}
                placeholder="e.g., Proxima Nova"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The name of the font family (all variants should share this name)
              </p>
            </div>

            {/* File Upload */}
            <div>
              <Label>Font Files</Label>
              <div
                className="mt-1 border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById('font-file-input')?.click()}
              >
                <input
                  id="font-file-input"
                  type="file"
                  multiple
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setFontFiles(Array.from(e.target.files));
                    }
                  }}
                />
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm font-medium">
                    {fontFiles.length > 0
                      ? `${fontFiles.length} file(s) selected`
                      : 'Click to select font files or drag and drop'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    TTF, OTF, WOFF, WOFF2 up to 10MB each
                  </p>
                </div>
              </div>
            </div>

            {/* File List with Auto-Detected Variants */}
            {fontFiles.length > 0 && (
              <div>
                <Label>Selected Files & Detected Variants</Label>
                <ScrollArea className="h-48 border rounded-md mt-1">
                  <div className="p-2 space-y-1">
                    {fontFiles.map((file, idx) => {
                      const variant = detectVariantFromFilename(file.name);
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{file.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(0)} KB
                            </div>
                          </div>
                          <Badge variant="secondary" className="ml-2">
                            {variant}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-6 w-6 p-0"
                            onClick={() => setFontFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Existing Uploaded Fonts */}
            {uploadingBrand && getUploadedFontFiles(uploadingBrand).length > 0 && (
              <div>
                <Label>Currently Uploaded Fonts</Label>
                <div className="mt-1 space-y-2">
                  {getUploadedFontFiles(uploadingBrand).map((font, idx) => (
                    <div key={idx} className="border rounded p-2">
                      <div className="font-medium text-sm mb-2">{font.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(font.variants).map(([variant, url]) => (
                          <div key={variant} className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {variant}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteFontVariant(uploadingBrand, font.name, variant)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadingBrand(null);
                setFontFiles([]);
                setFontFamilyName('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleFontUpload} disabled={uploading || fontFiles.length === 0 || !fontFamilyName.trim()}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? `Uploading ${fontFiles.length} file(s)...` : 'Upload Fonts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayoutV2>
  );
};

export default AdminBrands;
