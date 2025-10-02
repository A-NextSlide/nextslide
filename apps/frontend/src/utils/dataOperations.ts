/**
 * Utility functions for data manipulation and transformation
 */

/**
 * Groups data by a specified key
 * @param data Array of objects
 * @param key Property to group by
 * @returns Object with keys grouped by the specified property
 */
export const groupBy = <T, K extends keyof T>(data: T[], key: K): Record<string, T[]> => {
  return data.reduce((result, item) => {
    const groupKey = String(item[key]);
    
    // Create the group if it doesn't exist
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    
    // Add the item to the group
    result[groupKey].push(item);
    
    return result;
  }, {} as Record<string, T[]>);
};

/**
 * Calculates summary statistics for a numeric array
 * @param data Array of numbers
 * @returns Object with min, max, sum, average, and count
 */
export const getStats = (data: number[]): { min: number; max: number; sum: number; avg: number; count: number } => {
  if (!data.length) {
    return { min: 0, max: 0, sum: 0, avg: 0, count: 0 };
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const sum = data.reduce((acc, val) => acc + val, 0);
  const avg = sum / data.length;
  
  return {
    min,
    max,
    sum,
    avg,
    count: data.length
  };
};

/**
 * Sorts data by the specified key
 * @param data Array of objects
 * @param key Property to sort by
 * @param direction Sort direction ('asc' or 'desc')
 * @returns Sorted array
 */
export const sortBy = <T, K extends keyof T>(
  data: T[],
  key: K,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...data].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    
    if (aValue === bValue) return 0;
    
    if (aValue === null || aValue === undefined) return direction === 'asc' ? -1 : 1;
    if (bValue === null || bValue === undefined) return direction === 'asc' ? 1 : -1;
    
    // Determine if the values are numbers
    const aNum = Number(aValue);
    const bNum = Number(bValue);
    
    // If both values can be parsed as numbers
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    
    // Handle string comparison
    const aString = String(aValue);
    const bString = String(bValue);
    
    return direction === 'asc'
      ? aString.localeCompare(bString)
      : bString.localeCompare(aString);
  });
};

/**
 * Returns the top N items from the data array
 * @param data Array of objects
 * @param key Property to sort by
 * @param limit Number of items to return
 * @returns Top N items
 */
export const getTopN = <T, K extends keyof T>(
  data: T[],
  key: K,
  limit: number
): T[] => {
  return sortBy(data, key, 'desc').slice(0, limit);
};

/**
 * Transforms a 2D array (table data) into an array of objects
 * @param data 2D array of values
 * @param headers Array of header names
 * @returns Array of objects with header names as keys
 */
export const tableToObjects = <T = Record<string, any>>(
  data: any[][],
  headers: string[]
): T[] => {
  return data.map(row => {
    const obj: Record<string, any> = {};
    
    row.forEach((cell, index) => {
      if (index < headers.length) {
        obj[headers[index]] = cell;
      }
    });
    
    return obj as unknown as T;
  });
};

/**
 * Transforms an array of objects into a 2D array (table data)
 * @param data Array of objects
 * @param headers Array of header names (object keys to include)
 * @returns 2D array of values
 */
export const objectsToTable = <T = Record<string, any>>(
  data: T[],
  headers: (keyof T)[]
): any[][] => {
  return data.map(item => {
    return headers.map(header => item[header]);
  });
};

/**
 * Calculates the percentage of a value relative to a total
 * @param value The value to calculate the percentage for
 * @param total The total value
 * @param precision Number of decimal places
 * @returns Percentage as a number
 */
export const calculatePercentage = (
  value: number,
  total: number,
  precision: number = 2
): number => {
  if (total === 0) return 0;
  
  const percentage = (value / total) * 100;
  const factor = Math.pow(10, precision);
  
  return Math.round(percentage * factor) / factor;
};

/**
 * Normalizes data to a 0-1 scale
 * @param data Array of numbers
 * @returns Normalized data array
 */
export const normalizeData = (data: number[]): number[] => {
  if (!data.length) return [];
  
  const { min, max } = getStats(data);
  const range = max - min;
  
  // If all values are the same, return an array of 0.5
  if (range === 0) {
    return data.map(() => 0.5);
  }
  
  // Normalize to 0-1 range
  return data.map(value => (value - min) / range);
};

/**
 * Bins data into groups for histograms
 * @param data Array of numbers
 * @param binCount Number of bins
 * @returns Object with bins and their counts
 */
export const binData = (
  data: number[],
  binCount: number = 10
): { range: [number, number]; count: number }[] => {
  if (!data.length) return [];
  
  const { min, max } = getStats(data);
  const range = max - min;
  const binSize = range / binCount;
  
  // Initialize bins
  const bins: { range: [number, number]; count: number }[] = [];
  
  for (let i = 0; i < binCount; i++) {
    const start = min + i * binSize;
    const end = min + (i + 1) * binSize;
    
    bins.push({
      range: [start, end],
      count: 0
    });
  }
  
  // Count values in each bin
  data.forEach(value => {
    // Special case for the maximum value, put it in the last bin
    if (value === max) {
      bins[bins.length - 1].count++;
      return;
    }
    
    const binIndex = Math.floor((value - min) / binSize);
    bins[binIndex].count++;
  });
  
  return bins;
};

/**
 * Calculates the moving average of a data array
 * @param data Array of numbers
 * @param windowSize Size of the moving window
 * @returns Array of moving averages
 */
export const movingAverage = (
  data: number[],
  windowSize: number = 3
): number[] => {
  if (!data.length || windowSize <= 0) return [];
  
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    // For the start of the array, use as many elements as available
    const start = Math.max(0, i - windowSize + 1);
    const end = i + 1;
    
    const windowSlice = data.slice(start, end);
    const sum = windowSlice.reduce((acc, val) => acc + val, 0);
    
    result.push(sum / windowSlice.length);
  }
  
  return result;
};

/**
 * Interpolates missing values in a data array
 * @param data Array of numbers with potential null/undefined values
 * @returns Array with interpolated values
 */
export const interpolateMissingValues = (data: (number | null | undefined)[]): number[] => {
  const result: number[] = [];
  let lastValidValue: number | null = null;
  let nextValidIndex: number | null = null;
  
  // First pass: Copy valid values and track the next valid value for each position
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    
    if (value !== null && value !== undefined && !isNaN(Number(value))) {
      result.push(Number(value));
      lastValidValue = Number(value);
    } else {
      // Find next valid value
      nextValidIndex = null;
      for (let j = i + 1; j < data.length; j++) {
        if (data[j] !== null && data[j] !== undefined && !isNaN(Number(data[j]))) {
          nextValidIndex = j;
          break;
        }
      }
      
      // Interpolate
      if (lastValidValue !== null && nextValidIndex !== null) {
        const nextValue = Number(data[nextValidIndex]);
        const step = (nextValue - lastValidValue) / (nextValidIndex - i + 1);
        result.push(lastValidValue + step);
      } else if (lastValidValue !== null) {
        // If no next valid value, use the last known value
        result.push(lastValidValue);
      } else if (nextValidIndex !== null) {
        // If no previous valid value, use the next valid value
        result.push(Number(data[nextValidIndex]));
      } else {
        // If no valid values at all, use zero
        result.push(0);
      }
    }
  }
  
  return result;
};