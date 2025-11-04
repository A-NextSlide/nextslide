"""
Font Size Standardizer - Rounds font sizes to standard values
This ensures consistent sizing across bullet points and text elements
"""
from typing import List
import logging

logger = logging.getLogger(__name__)


class FontSizeStandardizer:
    """
    Standardizes font sizes to common typographic scales.
    Prevents odd sizes like 21.4, instead using standard sizes like 24, 20, 18, etc.
    """
    
    # Standard font size scale based on typographic best practices
    # This ensures bullet points group at the same size levels
    STANDARD_SIZES = [
        8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 
        40, 44, 48, 54, 60, 66, 72, 80, 88, 96
    ]
    
    # Alternative: More granular scale (if you want more options)
    GRANULAR_SIZES = [
        8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 
        32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 88, 96
    ]
    
    def __init__(self, use_granular: bool = False):
        """
        Initialize the standardizer.
        
        Args:
            use_granular: If True, uses more size options. If False, uses standard scale.
        """
        self.size_scale = self.GRANULAR_SIZES if use_granular else self.STANDARD_SIZES
        logger.info(f"FontSizeStandardizer initialized with {len(self.size_scale)} standard sizes")
    
    def standardize(self, size: float, prefer_round_down: bool = False) -> int:
        """
        Round a font size to the nearest standard size.
        
        Args:
            size: The calculated font size (can be decimal like 21.4)
            prefer_round_down: If True, round down instead of to nearest (useful for preventing overflow)
        
        Returns:
            Standardized font size as integer
        
        Examples:
            21.4 -> 20 (or 22 if rounding to nearest)
            18.7 -> 18 (or 20)
            47.3 -> 48
        """
        if size < self.size_scale[0]:
            return self.size_scale[0]
        
        if size >= self.size_scale[-1]:
            return self.size_scale[-1]
        
        # Find the closest standard sizes
        for i in range(len(self.size_scale) - 1):
            lower = self.size_scale[i]
            upper = self.size_scale[i + 1]
            
            if lower <= size <= upper:
                if prefer_round_down:
                    return lower
                else:
                    # Round to nearest
                    if (size - lower) < (upper - size):
                        return lower
                    else:
                        return upper
        
        return self.size_scale[-1]
    
    def standardize_with_constraints(
        self, 
        size: float, 
        min_size: float, 
        max_size: float,
        prefer_round_down: bool = False
    ) -> int:
        """
        Standardize a font size while respecting min/max constraints.
        
        Args:
            size: The calculated font size
            min_size: Minimum allowed size
            max_size: Maximum allowed size
            prefer_round_down: If True, round down to prevent overflow
        
        Returns:
            Standardized font size within constraints
        """
        # First standardize
        standardized = self.standardize(size, prefer_round_down)
        
        # Then apply constraints
        standardized = max(self.standardize(min_size, prefer_round_down=False), standardized)
        standardized = min(self.standardize(max_size, prefer_round_down=True), standardized)
        
        return standardized
    
    def get_next_smaller(self, size: int) -> int:
        """Get the next smaller standard size."""
        standardized = self.standardize(size)
        idx = self.size_scale.index(standardized)
        if idx > 0:
            return self.size_scale[idx - 1]
        return self.size_scale[0]
    
    def get_next_larger(self, size: int) -> int:
        """Get the next larger standard size."""
        standardized = self.standardize(size)
        idx = self.size_scale.index(standardized)
        if idx < len(self.size_scale) - 1:
            return self.size_scale[idx + 1]
        return self.size_scale[-1]
    
    def group_similar_sizes(self, sizes: List[float], tolerance: int = 2) -> List[List[int]]:
        """
        Group similar font sizes together after standardization.
        This helps ensure bullet points at the same level use the same size.
        
        Args:
            sizes: List of calculated font sizes
            tolerance: How many steps apart sizes can be to still group together
        
        Returns:
            List of groups, where each group contains standardized sizes
        
        Example:
            [21.4, 21.8, 18.3, 18.9, 16.2] -> [[20, 20], [18, 18], [16]]
        """
        if not sizes:
            return []
        
        standardized = [self.standardize(s) for s in sizes]
        groups = []
        current_group = [standardized[0]]
        
        for size in standardized[1:]:
            if abs(size - current_group[0]) <= tolerance:
                current_group.append(size)
            else:
                groups.append(current_group)
                current_group = [size]
        
        if current_group:
            groups.append(current_group)
        
        return groups
    
    def equalize_group_sizes(self, sizes: List[float]) -> List[int]:
        """
        Equalize sizes that are close to each other.
        Useful for making all bullet points at the same level the same size.
        
        Args:
            sizes: List of calculated font sizes that should be similar
        
        Returns:
            List of standardized sizes, all equal if they were close
        
        Example:
            [21.4, 21.8, 22.1, 20.9] -> [22, 22, 22, 22]
        """
        if not sizes:
            return []
        
        # Standardize all sizes
        standardized = [self.standardize(s) for s in sizes]
        
        # Find the median standardized size
        sorted_sizes = sorted(standardized)
        median_idx = len(sorted_sizes) // 2
        median_size = sorted_sizes[median_idx]
        
        # Use the median size for all items in the group
        return [median_size] * len(sizes)


# Global instance for easy access
_standardizer = FontSizeStandardizer(use_granular=False)


def standardize_font_size(size: float, prefer_round_down: bool = False) -> int:
    """
    Convenience function to standardize a font size.
    
    Args:
        size: Font size to standardize (e.g., 21.4)
        prefer_round_down: If True, rounds down to prevent overflow
    
    Returns:
        Standard font size (e.g., 20 or 22)
    """
    return _standardizer.standardize(size, prefer_round_down)


def standardize_with_min_max(size: float, min_size: float, max_size: float) -> int:
    """
    Convenience function to standardize with constraints.
    """
    return _standardizer.standardize_with_constraints(size, min_size, max_size)

