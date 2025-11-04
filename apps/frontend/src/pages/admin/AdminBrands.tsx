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
import { Search, Palette, Trash2, Edit, Save, X, CheckCircle, XCircle, Plus, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminBrands: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editedData, setEditedData] = useState<string>('');
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [editedFonts, setEditedFonts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Brand | null>(null);

  const pageSize = 20;

  useEffect(() => {
    loadBrands();
  }, [currentPage, searchQuery]);

  const loadBrands = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getBrands({
        page: currentPage,
        limit: pageSize,
        search: searchQuery || undefined,
      });
      setBrands(response.brands);
      setTotalPages(response.totalPages);
      setTotal(response.total);
    } catch (error) {
      console.error('Error loading brands:', error);
    } finally {
      setLoading(false);
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
      loadBrands();
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
        </div>

        {/* Brands Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-16 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : brands.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Palette className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No brands found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Try adjusting your search query' : 'No brands cached yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {brands.map((brand) => {
                const colors = getColorArray(brand);
                const fonts = getFonts(brand);
                const brandName = brand.api_response?.brand_name || brand.identifier;
                const domain = brand.api_response?.domain || brand.normalized_identifier;

                return (
                  <Card key={brand.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{brandName}</CardTitle>
                          <CardDescription className="text-xs truncate">{domain}</CardDescription>
                        </div>
                        <Badge variant={brand.success ? 'default' : 'destructive'} className="ml-2">
                          {brand.success ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Color Palette */}
                      {colors.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Colors ({colors.length})
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {colors.map((color, idx) => (
                              <div
                                key={idx}
                                className="group relative"
                                title={color}
                              >
                                <div
                                  className="w-10 h-10 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer hover:scale-110 transition-transform"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  <span className="text-xs bg-black text-white px-2 py-1 rounded whitespace-nowrap">
                                    {color}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fonts */}
                      {fonts.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Fonts ({fonts.length})
                          </Label>
                          <div className="flex flex-wrap gap-1">
                            {fonts.slice(0, 3).map((font, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {font}
                              </Badge>
                            ))}
                            {fonts.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{fonts.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <span>Used {brand.hit_count} times</span>
                        <span>
                          {new Date(brand.last_accessed_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEdit(brand)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteConfirm(brand)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
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
                            className="flex-1"
                            style={{ fontFamily: font }}
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
    </AdminLayoutV2>
  );
};

export default AdminBrands;
