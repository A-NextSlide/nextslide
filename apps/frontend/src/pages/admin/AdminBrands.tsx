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
import {
  Search, Palette, Trash2, Edit, Save, X, CheckCircle, XCircle, Plus, Code, Upload,
  Download, AlertCircle, RefreshCw, Image, Type, Globe, Loader2, ExternalLink
} from 'lucide-react';
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

  // New brand fetch states
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandIdentifier, setNewBrandIdentifier] = useState('');
  const [fetching, setFetching] = useState(false);
  const [refreshingBrand, setRefreshingBrand] = useState<string | null>(null);

  const pageSize = 50;
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      const parsedData = JSON.parse(editedData);
      if (!parsedData.colors) parsedData.colors = {};
      parsedData.colors.primary = editedColors.map(hex => ({ hex, type: 'primary' }));
      if (editedFonts.length > 0) {
        parsedData.fonts = { names: editedFonts };
      }

      await adminApi.updateBrand(editingBrand.id, parsedData);
      setEditingBrand(null);
      loadBrands(1);
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
      setBrands(prev => prev.filter(b => b.id !== brand.id));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('Error deleting brand:', error);
      alert('Error deleting brand');
    }
  };

  // Fetch new brand from Brandfetch
  const handleFetchBrand = async () => {
    if (!newBrandIdentifier.trim()) return;

    setFetching(true);
    try {
      const response = await adminApi.fetchBrandFromBrandfetch(newBrandIdentifier.trim());
      setShowAddBrand(false);
      setNewBrandIdentifier('');

      // Refresh the list
      loadBrands(1);

      alert(`Brand ${response.action} successfully: ${response.brand.api_response?.brand_name || response.brand.identifier}`);
    } catch (error: any) {
      console.error('Error fetching brand:', error);
      alert(error.message || 'Error fetching brand from Brandfetch');
    } finally {
      setFetching(false);
    }
  };

  // Refresh existing brand from Brandfetch
  const handleRefreshBrand = async (brand: Brand) => {
    const identifier = brand.api_response?.domain || brand.normalized_identifier || brand.identifier;

    setRefreshingBrand(brand.id);
    try {
      const response = await adminApi.fetchBrandFromBrandfetch(identifier);

      // Update the brand in local state
      setBrands(prev => prev.map(b =>
        b.id === brand.id ? { ...response.brand, id: brand.id, hit_count: brand.hit_count, last_accessed_at: brand.last_accessed_at, created_at: brand.created_at } : b
      ));

    } catch (error: any) {
      console.error('Error refreshing brand:', error);
      alert(error.message || 'Error refreshing brand from Brandfetch');
    } finally {
      setRefreshingBrand(null);
    }
  };

  const getColorArray = (brand: Brand): string[] => {
    const colors: string[] = [];
    const apiResponse = brand.api_response;

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

    if (apiResponse?.colors) {
      extractColors(apiResponse.colors);
    }

    return colors.slice(0, 12);
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

  // Get the best logo URL from brand data
  const getBestLogo = (brand: Brand): string | null => {
    const logos = brand.api_response?.logos;
    if (!logos) return null;

    // Try light theme first, then dark, then icons, then other
    const themes = ['light', 'dark', 'icons', 'other'];

    for (const theme of themes) {
      const logoList = logos[theme];
      if (Array.isArray(logoList) && logoList.length > 0) {
        const logo = logoList[0];
        const formats = logo?.formats;
        if (Array.isArray(formats) && formats.length > 0) {
          // Prefer SVG, then PNG
          const svgFormat = formats.find((f: any) => f.format === 'svg' || f.url?.endsWith('.svg'));
          if (svgFormat?.url) return svgFormat.url;

          const pngFormat = formats.find((f: any) => f.format === 'png' || f.url?.endsWith('.png'));
          if (pngFormat?.url) return pngFormat.url;

          // Return first available
          if (formats[0]?.url) return formats[0].url;
        }
      }
    }

    return null;
  };

  const detectVariantFromFilename = (filename: string): string => {
    const lower = filename.toLowerCase();

    if (lower.includes('bolditalic') || lower.includes('bold-italic') || lower.includes('bold_italic')) {
      return 'bold-italic';
    }

    if (lower.includes('bold') || lower.includes('bd')) return 'bold';
    if (lower.includes('italic') || lower.includes('it') || lower.includes('oblique')) return 'italic';
    if (lower.includes('light') || lower.includes('lt')) return 'light';
    if (lower.includes('thin')) return 'thin';
    if (lower.includes('medium') || lower.includes('md')) return 'medium';
    if (lower.includes('semibold') || lower.includes('semi-bold')) return 'semibold';
    if (lower.includes('extrabold') || lower.includes('extra-bold')) return 'extrabold';
    if (lower.includes('black')) return 'black';
    if (lower.includes('regular') || lower.includes('normal') || lower.includes('book')) return 'regular';

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
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {total} brands cached
            </Badge>
            <Button onClick={() => setShowAddBrand(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Brand
            </Button>
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

        {/* Brands Grid */}
        <Card className="overflow-hidden">
          <ScrollArea className="h-[calc(100vh-280px)]" onScrollCapture={handleScroll}>
            <div className="p-4">
              {brands.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Palette className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No brands found</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'Try adjusting your search query' : 'No brands cached yet'}
                  </p>
                  <Button onClick={() => setShowAddBrand(true)} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Add Your First Brand
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {brands.map((brand) => {
                    const colors = getColorArray(brand);
                    const fonts = getFonts(brand);
                    const brandName = brand.api_response?.brand_name || brand.identifier;
                    const domain = brand.api_response?.domain || brand.normalized_identifier;
                    const logoUrl = getBestLogo(brand);
                    const hasUploadedFontsFlag = hasUploadedFonts(brand);
                    const isRefreshing = refreshingBrand === brand.id;

                    return (
                      <Card
                        key={brand.id}
                        className={cn(
                          "overflow-hidden transition-all hover:shadow-lg",
                          !brand.success && "border-red-300 bg-red-50/30 dark:border-red-900 dark:bg-red-950/30"
                        )}
                      >
                        {/* Logo Section */}
                        <div className="relative h-24 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt={brandName}
                              className="max-h-16 max-w-[80%] object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center text-muted-foreground">
                              <Image className="h-8 w-8 mb-1 opacity-50" />
                              <span className="text-xs">No logo</span>
                            </div>
                          )}

                          {/* Status badge */}
                          <Badge
                            variant={brand.success ? 'outline' : 'destructive'}
                            className="absolute top-2 right-2 text-xs"
                          >
                            {brand.success ? 'Active' : 'Failed'}
                          </Badge>
                        </div>

                        <CardContent className="p-4 space-y-3">
                          {/* Brand Name & Domain */}
                          <div>
                            <h3 className="font-semibold text-sm truncate" title={brandName}>
                              {brandName}
                            </h3>
                            <a
                              href={`https://${domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate"
                            >
                              <Globe className="h-3 w-3" />
                              {domain}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>

                          {/* Colors */}
                          <div>
                            <Label className="text-xs text-muted-foreground">Colors</Label>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {colors.length > 0 ? (
                                colors.slice(0, 8).map((color, idx) => (
                                  <div
                                    key={idx}
                                    className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  />
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No colors</span>
                              )}
                              {colors.length > 8 && (
                                <span className="text-xs text-muted-foreground">+{colors.length - 8}</span>
                              )}
                            </div>
                          </div>

                          {/* Fonts */}
                          <div>
                            <Label className="text-xs text-muted-foreground">Fonts</Label>
                            <div className="mt-1 space-y-1">
                              {hasUploadedFontsFlag ? (
                                getUploadedFontFiles(brand).map((font, idx) => (
                                  <div key={idx} className="flex items-center gap-1">
                                    <Badge variant="default" className="text-xs gap-1 bg-green-600">
                                      <CheckCircle className="h-2.5 w-2.5" />
                                      {font.name}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      ({Object.keys(font.variants).length} files)
                                    </span>
                                  </div>
                                ))
                              ) : fonts.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {fonts.slice(0, 2).map((fontName, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                                      <Type className="h-2.5 w-2.5" />
                                      {fontName}
                                    </Badge>
                                  ))}
                                  {fonts.length > 2 && (
                                    <span className="text-xs text-muted-foreground">+{fonts.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No fonts</span>
                              )}
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                            <span>{brand.hit_count} hits</span>
                            <span>{new Date(brand.last_accessed_at).toLocaleDateString()}</span>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRefreshBrand(brand)}
                              disabled={isRefreshing}
                              className="flex-1 h-8 text-xs"
                              title="Refresh from Brandfetch"
                            >
                              {isRefreshing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setUploadingBrand(brand);
                                setFontFamilyName(brand.api_response?.brand_name || '');
                              }}
                              className="flex-1 h-8 text-xs"
                              title="Upload fonts"
                            >
                              <Upload className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(brand)}
                              className="flex-1 h-8 text-xs"
                              title="Edit brand"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteConfirm(brand)}
                              className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Delete brand"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Loading indicator */}
              {loading && (
                <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more brands...
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Add Brand Dialog */}
      <Dialog open={showAddBrand} onOpenChange={setShowAddBrand}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Brand from Brandfetch
            </DialogTitle>
            <DialogDescription>
              Enter a domain (e.g., nike.com) or brand name to fetch brand data from Brandfetch API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="brand-identifier">Domain or Brand Name</Label>
              <Input
                id="brand-identifier"
                value={newBrandIdentifier}
                onChange={(e) => setNewBrandIdentifier(e.target.value)}
                placeholder="e.g., nike.com, Apple, starbucks.com"
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !fetching) {
                    handleFetchBrand();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                For best results, use the exact domain (e.g., apple.com instead of Apple)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBrand(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFetchBrand}
              disabled={fetching || !newBrandIdentifier.trim()}
              className="gap-2"
            >
              {fetching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Fetch Brand
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
