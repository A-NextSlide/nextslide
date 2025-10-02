import base64
import io
import os
import time
from PIL import Image, ImageDraw, ImageFont
from typing import List, Optional, Union, Tuple
from datetime import datetime

# Debug directory for saving images
DEBUG_IMAGE_DIR = os.environ.get('SLIDE_DEBUG_DIR', '/tmp/slide_debug_images')

def ensure_debug_dir():
    """Ensure the debug directory exists"""
    os.makedirs(DEBUG_IMAGE_DIR, exist_ok=True)
    return DEBUG_IMAGE_DIR

def decode_base64_image(base64_string: str) -> Optional[Image.Image]:
    """
    Decode a base64 string into a PIL Image.
    
    Args:
        base64_string: Base64 encoded image string (with or without data URL prefix)
        
    Returns:
        PIL Image object or None if failed
    """
    try:
        # Handle data URL format (data:image/png;base64,...)
        if base64_string.startswith('data:image'):
            # Extract the base64 data after the comma
            base64_data = base64_string.split(',', 1)[1]
        else:
            # Assume it's already raw base64 data
            base64_data = base64_string
            
        # Decode base64 to bytes
        image_data = base64.b64decode(base64_data)
        
        # Create image from bytes
        return Image.open(io.BytesIO(image_data))
    except Exception as e:
        print(f"Error decoding base64 image: {e}")
        return None

def combine_images(images: List[Union[str, Image.Image]], 
                  max_width: int = 1920, 
                  max_images: int = 5,
                  debug: bool = False,
                  debug_prefix: str = "combined_") -> Optional[str]:
    """
    Combine multiple images into a single image stacked vertically with separator lines
    and slide number labels.
    
    Args:
        images: List of base64 strings or PIL Image objects to combine
        max_width: Maximum width of the combined image
        max_images: Maximum number of images to include (will take first N)
        debug: Whether to save debug images to disk
        debug_prefix: Prefix for debug image filenames
        
    Returns:
        Base64-encoded string of the combined image, or None if failed
    """
    if not images:
        return None
        
    # Limit the number of images to process
    images = images[:max_images]
    
    try:
        # Load all images
        pil_images = []
        for i, img in enumerate(images):
            try:
                if isinstance(img, str):
                    pil_img = decode_base64_image(img)
                elif isinstance(img, Image.Image):
                    pil_img = img
                else:
                    print(f"Unsupported image type: {type(img)}")
                    continue
                    
                if pil_img:
                    pil_images.append(pil_img)
                    # Save individual images if debug is enabled
                    if debug:
                        save_debug_image(pil_img, f"{debug_prefix}_input_{i+1}")
            except Exception as e:
                print(f"Error loading image {i}: {e}")
                
        if not pil_images:
            return None
            
        # The following logic handles n >= 1 images.
        
        # Assume all images have the same dimensions as the first one
        first_img = pil_images[0]
        first_img_width = first_img.width
        first_img_height = first_img.height
        num_images = len(pil_images)
        
        target_width = first_img_width # Use first image's width
        
        # Calculate the total height with separator lines (if num_images > 1)
        separator_height = 3
        # Height = (image height * num_images) + separator height * (num_images - 1)
        # This works for num_images = 1, as the separator term becomes 0.
        total_height = (first_img_height * num_images) + separator_height * (num_images - 1)
        
        # Create the combined image
        result_img = Image.new('RGB', (target_width, total_height), 'white')
        
        # Add images with separator lines and labels
        draw = ImageDraw.Draw(result_img)
        
        # Try to get a nice font
        try:
            font = ImageFont.truetype("Arial", 14)
        except IOError:
            font = ImageFont.load_default()
        
        y_offset = 0
        for i, img in enumerate(pil_images):
            # Check if image width matches target width (optional, for robustness)
            if img.width != target_width or img.height != first_img_height:
                print(f"Warning: Slide {i+1} dimensions ({img.width}x{img.height}) differ from first slide ({target_width}x{first_img_height}). Sticking to first slide dimensions for layout.")
                # Potential issue: Pasting might crop or leave gaps if dimensions truly differ.
            
            # Paste the image at (0, y_offset)
            result_img.paste(img, (0, y_offset))
            
            # Add slide number label to bottom right relative to the image area
            label_text = f"Slide {i+1}"
            
            # Get text size
            try:
                # Attempt using textbbox first for better accuracy if available
                bbox = draw.textbbox((0, 0), label_text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
            except AttributeError:
                # Fallback for older Pillow versions
                text_width, text_height = draw.textsize(label_text, font=font)
                
            # Calculate label position, removing padding offsets
            label_x = target_width - text_width
            label_y = y_offset + first_img_height - text_height
            
            # Ensure label coordinates are within bounds (especially important if text is large)
            label_x = max(0, label_x)
            label_y = max(y_offset, label_y) # Ensure label y is at least at the top of the current image slot

            # Adjust rectangle to remove padding
            # Ensure rectangle coordinates are valid
            rect_x0 = label_x
            rect_y0 = label_y
            rect_x1 = label_x + text_width
            rect_y1 = label_y + text_height
            draw.rectangle(
                [(rect_x0, rect_y0), (rect_x1, rect_y1)],
                fill=(240, 240, 240, 200)
            )
            
            # Draw the label text
            draw.text((label_x, label_y), label_text, fill=(0, 0, 0), font=font)
            
            # Move to next position: image height (no padding)
            current_y_advance = first_img_height
            y_offset += current_y_advance
            
            # Add separator line if this isn't the last image
            if i < num_images - 1:
                separator_y = y_offset # Position separator immediately after the image height
                draw.line([(0, separator_y), (target_width, separator_y)], fill=(200, 200, 200), width=separator_height)
                y_offset += separator_height # Add separator height to offset
        
        # Save the final image if debug is enabled
        if debug:
            save_debug_image(result_img, debug_prefix)
            
        # Convert to base64
        buffer = io.BytesIO()
        result_img.save(buffer, format="PNG")
        img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return f"data:image/png;base64,{img_str}"
        
    except Exception as e:
        print(f"Error combining images: {e}")
        return None

def image_to_base64(image: Union[str, Image.Image]) -> Optional[str]:
    """
    Convert an image to a base64-encoded data URL.
    
    Args:
        image: Path to the image file, PIL Image object, or existing base64 string
        
    Returns:
        Base64-encoded data URL string, or None if failed
    """
    try:
        # If already a base64 string, return it
        if isinstance(image, str):
            if image.startswith('data:image'):
                return image
            elif os.path.isfile(image):
                # It's a file path
                with open(image, "rb") as img_file:
                    img_data = img_file.read()
                encoded = base64.b64encode(img_data).decode('utf-8')
                return f"data:image/png;base64,{encoded}"
            else:
                # Assume it's raw base64 data
                return f"data:image/png;base64,{image}"
        
        # If it's a PIL Image
        elif isinstance(image, Image.Image):
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
            return f"data:image/png;base64,{img_str}"
            
        return None
        
    except Exception as e:
        print(f"Error converting image to base64: {e}")
        return None

def save_debug_image(image: Union[str, Image.Image], label: str = "image") -> str:
    """
    Save an image to the debug directory with a timestamp and label
    
    Args:
        image: Path to the image file, PIL Image object, or base64 string
        label: Label for the debug image
        
    Returns:
        Path to the saved debug image
    """
    try:
        # Ensure debug directory exists
        debug_dir = ensure_debug_dir()
        
        # Convert to PIL Image if needed
        pil_image = None
        if isinstance(image, str):
            if image.startswith('data:image'):
                pil_image = decode_base64_image(image)
            elif os.path.isfile(image):
                pil_image = Image.open(image)
        elif isinstance(image, Image.Image):
            pil_image = image
            
        if not pil_image:
            return ""
            
        # Generate a unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{label}.png"
        output_path = os.path.join(debug_dir, filename)
        
        # Save the image
        pil_image.save(output_path)
        
        print(f"Saved debug image to: {output_path}")
        return output_path
        
    except Exception as e:
        print(f"Error saving debug image: {e}")
        return ""

def save_debug_image_data(img: Union[Image.Image, str], label: str = "image") -> str:
    """
    Save an image or base64 image data to the debug directory
    
    Args:
        img: PIL Image object or base64 string
        label: Label for the debug image
        
    Returns:
        Path to the saved debug image
    """
    return save_debug_image(img, label)

def display_image_data(image_data: str, title: str = "Debug Image") -> str:
    """
    Display an image from base64 data. In server environments, this saves the image to disk.
    In notebook or desktop environments, it attempts to display the image directly.
    
    Args:
        image_data: Base64 encoded image data
        title: Title for the image display or filename
        
    Returns:
        Path to the saved debug image
    """
    try:
        # First save the image to disk
        output_path = save_debug_image(image_data, title)
        
        # Try to display the image directly (works in notebooks/IDEs with display capabilities)
        try:
            # Check if we're in an environment that can display images
            # This is a minimal attempt that works for IPython/Jupyter environments
            from IPython import display
            if image_data.startswith('data:image'):
                # Extract content type and base64 data
                content_type = image_data.split(';')[0].split(':')[1]
                base64_data = image_data.split(',')[1]
                
                # Display the image
                display.display(display.Image(data=base64.b64decode(base64_data), format=content_type.split('/')[1]))
                print(f"Displayed image: {title}")
            else:
                # If it's not in data URL format, try to convert from raw base64
                display.display(display.Image(data=base64.b64decode(image_data)))
                print(f"Displayed image: {title}")
        except (ImportError, Exception) as e:
            # Can't display directly (e.g., in server environments)
            print(f"Image saved to: {output_path}")
            print(f"(Direct display not available: {str(e)})")
        
        return output_path
    except Exception as e:
        print(f"Error displaying image: {e}")
        return ""

def get_combined_slide_images(before_images: List[Union[str, Image.Image]], after_images: List[Union[str, Image.Image]], debug: bool = True) -> Tuple[str, str]:
    """
    Create and save combined before and after slide images 
    
    Args:
        before_images: List of base64 strings, PIL Images, or file paths to before images
        after_images: List of base64 strings, PIL Images, or file paths to after images
        
    Returns:
        Tuple of (combined before image base64, combined after image base64)
    """
    print(f"Creating combined slide images for {len(before_images)} before and {len(after_images)} after slides")
    
    # Create combined images (Do NOT pass debug flag down)
    before_combined = combine_images(before_images)
    after_combined = combine_images(after_images)
    
    # Optionally save the final combined base64 images to disk for debugging
    debug_dir = ensure_debug_dir()
    if before_combined and debug:
        save_debug_image(before_combined, "before_combined") # Original filename
    
    if after_combined and debug:
        save_debug_image(after_combined, "after_combined") # Original filename
    
    return before_combined, after_combined 