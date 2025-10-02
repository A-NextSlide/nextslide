export const determineFileType = (file: File): 'image' | 'chart' | 'data' | 'pdf' | 'other' => {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.apple.numbers' ||
    mimeType === 'application/vnd.oasis.opendocument.spreadsheet' ||
    extension === 'csv' || extension === 'xls' || extension === 'xlsx' ||
    extension === 'numbers' || extension === 'ods'
  ) return 'data'; // Treat as 'data' for potential charting
  return 'other';
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// If you have other file-related utilities, they can go here. 