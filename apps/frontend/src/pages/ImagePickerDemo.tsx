import React, { useState } from 'react';
import ImagePicker from '@/components/deck/viewport/ImagePicker';
import { Button } from '@/components/ui/button';
import { Sparkles, Image as ImageIcon } from 'lucide-react';

// Sample image data
const sampleImages = [
  {
    id: 'img-1',
    url: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400',
    alt: 'NBA basketball game',
    photographer: 'Markus Spiske',
  },
  {
    id: 'img-2',
    url: 'https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400',
    alt: 'NBA player dunking',
    photographer: 'Ramiro Pianarosa',
  },
  {
    id: 'img-3',
    url: 'https://images.unsplash.com/photo-1627627256672-027a4613d028?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1627627256672-027a4613d028?w=400',
    alt: 'Golf course green',
    photographer: 'Courtney Cook',
  },
  {
    id: 'img-4',
    url: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400',
    alt: 'Golf player swinging',
    photographer: 'Peter Drew',
  },
  {
    id: 'img-5',
    url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400',
    alt: 'Basketball on court',
    photographer: 'Kylie Osullivan',
  },
  {
    id: 'img-6',
    url: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=400',
    alt: 'Golf clubs and ball',
    photographer: 'Thomas Park',
  },
];

const ImagePickerDemo: React.FC = () => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageSelect = (imageUrl: string) => {
    setSelectedImages(prev => {
      if (prev.includes(imageUrl)) {
        return prev.filter(url => url !== imageUrl);
      }
      if (prev.length >= 2) {
        // Replace oldest selection
        return [prev[1], imageUrl];
      }
      return [...prev, imageUrl];
    });
  };

  const handleLoadMore = async (topic: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);
    console.log(`Loading more images for topic: ${topic}`);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Image Picker Demo</h1>
        <p className="text-muted-foreground mb-8">
          This demonstrates the new image selection UI for slides with placeholder images.
        </p>

        {/* Demo slide preview */}
        <div className="bg-card border border-border rounded-lg p-8 mb-8">
          <h2 className="text-xl font-semibold mb-4">Slide Preview: NBA vs Golf</h2>
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map(index => (
              <div
                key={index}
                className="aspect-video bg-secondary/20 border-2 border-dashed border-border rounded-lg flex items-center justify-center"
              >
                {selectedImages[index] ? (
                  <img
                    src={selectedImages[index]}
                    alt="Selected"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Image Placeholder {index + 1}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Open picker button */}
        <div className="flex justify-center mb-8">
          <Button
            onClick={() => setIsPickerOpen(true)}
            size="lg"
            className="flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Select Images
            <span className="ml-2 px-2 py-0.5 bg-primary-foreground/20 rounded text-sm">
              2 needed
            </span>
          </Button>
        </div>

        {/* Image picker overlay */}
        {isPickerOpen && (
          <div className="fixed inset-0 z-50">
            <ImagePicker
              images={sampleImages}
              onImageSelect={handleImageSelect}
              onClose={() => setIsPickerOpen(false)}
              onLoadMore={handleLoadMore}
              selectedImages={selectedImages}
              placeholderCount={2}
              slideTitle="NBA vs Golf"
              topics={['NBA', 'Golf', 'Basketball']}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-6 space-y-3">
          <h3 className="font-semibold">How it works:</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Click "Select Images" to open the image picker</li>
            <li>• The picker shows images found for the slide's content</li>
            <li>• Filter by topic using the pills at the top</li>
            <li>• Click images to select them for placeholders</li>
            <li>• Selected images show a checkmark</li>
            <li>• The UI clearly shows how many images are needed</li>
            <li>• Smooth animations make the experience delightful</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ImagePickerDemo; 