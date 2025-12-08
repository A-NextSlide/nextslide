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

interface LabeledColors {
  background: string;
  text: string;
  accent: string;
  accent2: string;
}

interface EditableBrandData {
  brand_name: string;
  domain: string;
  logo_url: string;
  colors: LabeledColors;
  fonts: string[];
}

const AdminBrands: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editedData, setEditedData] = useState<string>('');
  const [editedBrandData, setEditedBrandData] = useState<EditableBrandData>({
    brand_name: '',
    domain: '',
    logo_url: '',
    colors: {
      background: '#FFFFFF',
      text: '#1A1A1A',
      accent: '#3B82F6',
      accent2: '#6B7280',
    },
    fonts: [],
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Brand | null>(null);
  const [uploadingBrand, setUploadingBrand] = useState<Brand | null>(null);
  const [fontFiles, setFontFiles] = useState<File[]>([]);
  const [fontFamilyName, setFontFamilyName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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

    // Initialize editable brand data
    const logoUrl = getBestLogo(brand) || '';
    setEditedBrandData({
      brand_name: brand.api_response?.brand_name || brand.identifier || '',
      domain: brand.api_response?.domain || brand.normalized_identifier || '',
      logo_url: logoUrl,
      colors: getLabeledColors(brand),
      fonts: getFonts(brand),
    });
  };

  const handleSave = async () => {
    if (!editingBrand) return;

    setSaving(true);
    try {
      // Parse the original JSON
      let parsedData: any;
      try {
        parsedData = JSON.parse(editedData);
      } catch {
        // If JSON is invalid, start from original
        parsedData = { ...editingBrand.api_response };
      }

      // Update with visual editor changes
      parsedData.brand_name = editedBrandData.brand_name;
      parsedData.domain = editedBrandData.domain;

      // Update colors with labeled structure (matches theme_agent.py)
      parsedData.colors = {
        background: editedBrandData.colors.background,
        text: editedBrandData.colors.text,
        accent: editedBrandData.colors.accent,
        accent2: editedBrandData.colors.accent2,
      };

      // Update fonts
      if (editedBrandData.fonts.length > 0) {
        if (!parsedData.fonts) parsedData.fonts = {};
        parsedData.fonts.names = editedBrandData.fonts;
      }

      // Update logo URL if changed
      if (editedBrandData.logo_url) {
        // Find or create logo structure
        if (!parsedData.logos) parsedData.logos = { light: [] };
        if (!parsedData.logos.light) parsedData.logos.light = [];

        // Update or add logo
        if (parsedData.logos.light.length > 0) {
          if (!parsedData.logos.light[0].formats) parsedData.logos.light[0].formats = [];
          // Check if URL already exists
          const existingFormat = parsedData.logos.light[0].formats.find(
            (f: any) => f.url === editedBrandData.logo_url
          );
          if (!existingFormat) {
            parsedData.logos.light[0].formats.unshift({
              url: editedBrandData.logo_url,
              format: editedBrandData.logo_url.endsWith('.svg') ? 'svg' : 'png'
            });
          }
        } else {
          parsedData.logos.light.push({
            formats: [{
              url: editedBrandData.logo_url,
              format: editedBrandData.logo_url.endsWith('.svg') ? 'svg' : 'png'
            }]
          });
        }
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

  const handleLabeledColorChange = (key: keyof LabeledColors, newColor: string) => {
    setEditedBrandData(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: newColor }
    }));
  };

  const handleFontChange = (index: number, newFont: string) => {
    setEditedBrandData(prev => ({
      ...prev,
      fonts: prev.fonts.map((f, i) => i === index ? newFont : f)
    }));
  };

  const handleAddFont = () => {
    setEditedBrandData(prev => ({
      ...prev,
      fonts: [...prev.fonts, 'Arial']
    }));
  };

  const handleRemoveFont = (index: number) => {
    setEditedBrandData(prev => ({
      ...prev,
      fonts: prev.fonts.filter((_, i) => i !== index)
    }));
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

  const getLabeledColors = (brand: Brand): LabeledColors => {
    const apiResponse = brand.api_response;
    const defaultColors: LabeledColors = {
      background: '#FFFFFF',
      text: '#1A1A1A',
      accent: '#3B82F6',
      accent2: '#6B7280',
    };

    if (!apiResponse?.colors) return defaultColors;

    const colors = apiResponse.colors;

    // Check if already labeled format (matching theme_agent.py structure)
    if (typeof colors.background === 'string' || typeof colors.text === 'string' || typeof colors.accent === 'string') {
      return {
        background: colors.background || defaultColors.background,
        text: colors.text || defaultColors.text,
        accent: colors.accent || defaultColors.accent,
        accent2: colors.accent2 || defaultColors.accent2,
      };
    }

    // Extract from various Brandfetch formats
    const extractedColors: string[] = [];

    // Case 1: colors is directly an array of hex strings
    if (Array.isArray(colors)) {
      colors.forEach((c: any) => {
        const hex = typeof c === 'string' ? c : c?.hex;
        if (hex && !extractedColors.includes(hex)) extractedColors.push(hex);
      });
    }

    // Case 2: colors.hex_list (SimpleBrandfetchCache format)
    if (Array.isArray(colors.hex_list)) {
      colors.hex_list.forEach((c: string) => {
        if (c && !extractedColors.includes(c)) extractedColors.push(c);
      });
    }

    // Case 3: colors.hex array
    if (Array.isArray(colors.hex)) {
      colors.hex.forEach((c: string) => {
        if (c && !extractedColors.includes(c)) extractedColors.push(c);
      });
    }

    // Case 4: colors.primary/accent/dark/light arrays with hex objects
    const colorArrays = ['primary', 'accent', 'dark', 'light'];
    for (const key of colorArrays) {
      if (Array.isArray(colors[key])) {
        colors[key].forEach((color: any) => {
          const hex = typeof color === 'string' ? color : color?.hex;
          if (hex && !extractedColors.includes(hex)) {
            extractedColors.push(hex);
          }
        });
      }
    }

    // Case 5: Fallback - iterate all object values
    if (extractedColors.length === 0 && typeof colors === 'object') {
      Object.values(colors).forEach((value: any) => {
        if (Array.isArray(value)) {
          value.forEach((color: any) => {
            const hex = typeof color === 'string' ? color : color?.hex;
            if (hex && !extractedColors.includes(hex)) {
              extractedColors.push(hex);
            }
          });
        }
      });
    }

    // Map extracted colors to labeled structure (matches theme_agent.py)
    return {
      background: defaultColors.background,
      text: defaultColors.text,
      accent: extractedColors[0] || defaultColors.accent,
      accent2: extractedColors[1] || defaultColors.accent2,
    };
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
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Brands</h1>
            <p className="text-sm text-[#666] dark:text-[#888]">
              Manage cached brand data
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
          <ScrollArea className="h-[calc(100vh-240px)]" onScrollCapture={handleScroll}>
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
                    const labeledColors = getLabeledColors(brand);
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
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Colors</Label>
                            <div className="flex gap-1">
                              {[
                                { key: 'accent', label: 'Accent' },
                                { key: 'accent2', label: 'Accent 2' },
                                { key: 'background', label: 'Background' },
                                { key: 'text', label: 'Text' },
                              ].map(({ key, label }) => (
                                <div
                                  key={key}
                                  className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm"
                                  style={{ backgroundColor: labeledColors[key as keyof LabeledColors] }}
                                  title={`${label}: ${labeledColors[key as keyof LabeledColors]}`}
                                />
                              ))}
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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-4">
              {/* Logo Preview in Header */}
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden border">
                {editedBrandData.logo_url ? (
                  <img
                    src={editedBrandData.logo_url}
                    alt={editedBrandData.brand_name}
                    className="max-h-12 max-w-12 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground opacity-50" />
                )}
              </div>
              <div>
                <DialogTitle className="text-xl">{editedBrandData.brand_name || 'Edit Brand'}</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  {editedBrandData.domain || 'No domain'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="visual" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="visual" className="gap-2">
                <Palette className="h-4 w-4" />
                Visual Editor
              </TabsTrigger>
              <TabsTrigger value="json" className="gap-2">
                <Code className="h-4 w-4" />
                JSON Editor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="flex-1 min-h-0">
              <ScrollArea className="h-[480px] pr-4">
                <div className="space-y-8">
                  {/* Brand Identity Section */}
                  <div className="bg-muted/30 rounded-lg p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Brand Identity</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="brand-name">Brand Name</Label>
                        <Input
                          id="brand-name"
                          value={editedBrandData.brand_name}
                          onChange={(e) => setEditedBrandData(prev => ({ ...prev, brand_name: e.target.value }))}
                          placeholder="e.g., Nike"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="brand-domain">Domain</Label>
                        <Input
                          id="brand-domain"
                          value={editedBrandData.domain}
                          onChange={(e) => setEditedBrandData(prev => ({ ...prev, domain: e.target.value }))}
                          placeholder="e.g., nike.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Logo Section */}
                  <div className="bg-muted/30 rounded-lg p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Logo</h3>
                    <div className="flex gap-6">
                      {/* Logo Preview */}
                      <div className="w-32 h-32 rounded-xl bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {editedBrandData.logo_url ? (
                          <img
                            src={editedBrandData.logo_url}
                            alt="Logo preview"
                            className="max-h-24 max-w-24 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '';
                              target.alt = 'Failed to load';
                            }}
                          />
                        ) : (
                          <div className="text-center text-muted-foreground">
                            <Image className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <span className="text-xs">No logo</span>
                          </div>
                        )}
                      </div>
                      {/* Logo URL/Upload Input */}
                      <div className="flex-1 space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="logo-url">Logo URL</Label>
                          <Input
                            id="logo-url"
                            value={editedBrandData.logo_url}
                            onChange={(e) => setEditedBrandData(prev => ({ ...prev, logo_url: e.target.value }))}
                            placeholder="https://example.com/logo.svg"
                            className="font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter a direct URL to the brand logo (SVG or PNG preferred)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">or</span>
                          <input
                            type="file"
                            accept="image/svg+xml,image/png,image/jpeg,image/webp"
                            className="hidden"
                            id="logo-file-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file && editingBrand) {
                                setUploadingLogo(true);
                                try {
                                  const result = await adminApi.uploadBrandLogo(editingBrand.id, file);
                                  setEditedBrandData(prev => ({ ...prev, logo_url: result.logo.url }));
                                } catch (error) {
                                  console.error('Failed to upload logo:', error);
                                  alert('Failed to upload logo');
                                } finally {
                                  setUploadingLogo(false);
                                }
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('logo-file-upload')?.click()}
                            disabled={uploadingLogo}
                            className="gap-1.5"
                          >
                            {uploadingLogo ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Upload className="h-3 w-3" />
                            )}
                            {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                          </Button>
                          {editedBrandData.logo_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditedBrandData(prev => ({ ...prev, logo_url: '' }))}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Colors Section */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Brand Colors</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'accent' as const, label: 'Accent' },
                        { key: 'accent2' as const, label: 'Accent 2' },
                        { key: 'background' as const, label: 'Background' },
                        { key: 'text' as const, label: 'Text' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={editedBrandData.colors[key]}
                              onChange={(e) => handleLabeledColorChange(key, e.target.value)}
                              className="w-8 h-8 rounded border border-gray-200 dark:border-gray-700 cursor-pointer flex-shrink-0"
                            />
                            <Input
                              value={editedBrandData.colors[key]}
                              onChange={(e) => handleLabeledColorChange(key, e.target.value.toUpperCase())}
                              placeholder="#000000"
                              className="font-mono text-xs h-8"
                              maxLength={7}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fonts Section */}
                  <div className="bg-muted/30 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Brand Fonts</h3>
                      <Button size="sm" variant="outline" onClick={handleAddFont} className="h-8">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Font
                      </Button>
                    </div>
                    {editedBrandData.fonts.length > 0 ? (
                      <div className="space-y-2">
                        {editedBrandData.fonts.map((font, index) => (
                          <div key={index} className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg p-2 border">
                            <Type className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <Input
                              value={font}
                              onChange={(e) => handleFontChange(index, e.target.value)}
                              placeholder="Font name"
                              className="flex-1 h-8"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveFont(index)}
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No fonts defined</p>
                        <Button size="sm" variant="outline" onClick={handleAddFont} className="mt-2">
                          <Plus className="h-3 w-3 mr-1" />
                          Add First Font
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="json" className="flex-1 min-h-0">
              <div className="h-[480px] flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="brand-data" className="text-sm text-muted-foreground">Raw API Response JSON</Label>
                  <Badge variant="outline" className="text-xs">Advanced</Badge>
                </div>
                <ScrollArea className="flex-1 border rounded-lg bg-muted/30">
                  <Textarea
                    id="brand-data"
                    value={editedData}
                    onChange={(e) => setEditedData(e.target.value)}
                    className="font-mono text-xs min-h-[450px] border-0 focus-visible:ring-0 bg-transparent resize-none"
                    placeholder="Paste JSON data here..."
                  />
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setEditingBrand(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
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
