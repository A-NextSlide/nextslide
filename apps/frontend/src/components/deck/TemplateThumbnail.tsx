import React, { useState, useEffect } from 'react';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';

interface TemplateThumbnailProps {
  imageUrl?: string;
  name: string;
  seed?: string; // Optional seed to get different cats
}

const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ imageUrl, name, seed }) => {
  const [catImageUrl, setCatImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    // Generate a unique URL for each template using the seed
    const catUrl = seed 
      ? `https://cataas.com/cat?${seed}` 
      : 'https://cataas.com/cat';
    
    setCatImageUrl(catUrl);
    setIsLoading(false);
  }, [seed]);
  
  if (isLoading) {
    return (
      <div className="absolute inset-0 w-full h-full">
        <ImagePlaceholder 
          message="Loading template..."
          showAnimation={true}
        />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="absolute inset-0 w-full h-full">
        <ImagePlaceholder 
          message="Template preview unavailable"
          showAnimation={false}
        />
      </div>
    );
  }
  
  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden">
      <img 
        src={catImageUrl || imageUrl} 
        alt={`Cat template for ${name}`}
        className="w-full h-full object-cover"
        onError={() => {
          setError(true);
          // Fallback to the original imageUrl if provided
          if (imageUrl) {
            setCatImageUrl(imageUrl);
            setError(false);
          }
        }}
      />
    </div>
  );
};

export default TemplateThumbnail;
