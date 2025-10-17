import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty, TypeFromSchema, UIArray } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { BorderWidthProperty } from '../library/border-shadow-properties';
import { createColorProperty } from '../library/color-properties';
import { PaddingProperty } from '../library/size-position-properties';
import { 
  FontSizeProperty,
  TextAlignProperty,
  FontFamilyProperty,
  FontWeightProperty,
  FontStyleProperty
} from '../library/text-typography-properties';

/**
 * Table Cell Style Schema
 * Defines styling for individual cells
 */
export const TableCellStyleSchema = UIObject(
  'TableCellStyle',
  {
  row: UIProperty(Type.Number(), {
    control: 'input',
    label: 'Row Index',
    description: 'Zero-based row index'
  }),
  
  col: UIProperty(Type.Number(), {
    control: 'input',
    label: 'Column Index',
    description: 'Zero-based column index'
  }),
  
  backgroundColor: createColorProperty(
    'Background Color',
    'Background color with alpha channel support',
    '#00000000'
  ),
  
  textColor: createColorProperty(
    'Text Color',
    'Text color with alpha channel support',
    '#000000ff'
  ),
  
  fontWeight: FontWeightProperty,
  
  fontStyle: FontStyleProperty,
  
  alignment: TextAlignProperty,
  
  colspan: Type.Optional(UIProperty(Type.Number(), {
    control: 'input',
    label: 'Column Span',
    description: 'Number of columns this cell spans'
  })),
  
  rowspan: Type.Optional(UIProperty(Type.Number(), {
    control: 'input',
    label: 'Row Span',
    description: 'Number of rows this cell spans'
  }))
});

/**
 * Table Styles Schema
 * Defines global styling for the entire table
 */
export const TableStylesSchema = UIObject(
  'TableStyles',
  {
  fontFamily: FontFamilyProperty,
  
  fontSize: FontSizeProperty,
  
  borderColor: createColorProperty(
    'Border Color',
    'Border color with alpha channel support',
    '#e2e8f0'
  ),
  
  borderWidth: BorderWidthProperty,
  
  cellPadding: PaddingProperty,
  
  headerBackgroundColor: createColorProperty(
    'Header Background',
    'Background color for table headers',
    '#f8fafc'
  ),
  
  headerTextColor: createColorProperty(
    'Header Text Color',
    'Text color for table headers',
    '#334155'
  ),
  
  cellBackgroundColor: createColorProperty(
    'Cell Background',
    'Background color for table cells',
    '#ffffff'
  ),
  
  textColor: createColorProperty(
    'Text Color',
    'Text color for table cells',
    '#334155'
  ),
  
  alignment: TextAlignProperty,
  
  alternatingRowColor: Type.Optional(UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Alternating Row Colors',
    description: 'Apply alternating background colors to rows'
  })),
  
  hoverEffect: Type.Optional(UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Hover Effect',
    description: 'Highlight cells on hover'
  }))
});

// Table data element - supports string content for now
// Rich text support will be handled at the renderer level
const TableDataElementSchema = UIProperty(Type.String(), {
  control: 'input',
  label: 'Cell Content',
  description: 'Content of a table cell'
});

const TableDataRowSchema = UIArray('Table Data Row', TableDataElementSchema, 
  'A row of table data', {
  control: 'custom',
  label: 'Table Data Row',
  description: 'A row of table data'
});

const TableDataSchema = UIArray('Table Data', TableDataRowSchema, '2D array of cell content (rows and columns of data)', {
  control: 'custom',
  label: 'Table Data',
  description: '2D array of cell content (rows and columns of data)'
});

/**
 * Table Component Schema
 * Displays structured data in a customizable tabular format with rich text support
 */
export const TableSchema = UIObject(
  'Table',
  {
    ...BaseComponentSchema.properties,
    
  data: TableDataSchema,
  
  headers: UIArray('Table Headers', Type.String(), 'Array of column header labels', {
    control: 'custom',
    label: 'Table Headers',
  }),
  
  showHeader: UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Show Header',
    description: 'Controls visibility of the header row'
  }),
  
  tableStyles: TableStylesSchema,
  
  cellStyles: UIArray("Cell Styles", TableCellStyleSchema, 'Array of style overrides for specific cells'),

  columnWidths: Type.Optional(UIArray('Column Widths', Type.Number(), 'Array of column widths in pixels', {
    control: 'custom',
    label: 'Column Widths',
    description: 'Stored widths for each column'
  })),

  enableSorting: Type.Optional(UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Enable Sorting',
    description: 'Allow sorting by clicking column headers'
  })),
  
  enableFiltering: Type.Optional(UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Enable Filtering',
    description: 'Show filter inputs for columns'
  })),
  
  resizableColumns: Type.Optional(UIProperty(Type.Boolean(), {
    control: 'checkbox',
    label: 'Resizable Columns',
    description: 'Allow users to resize column widths'
  }))
});

/**
 * Table properties type
 */
export type TableProps = TypeFromSchema<typeof TableSchema>;

/**
 * Table component definition
 */
export const TableDefinition: ComponentDefinition<typeof TableSchema> = {
  type: 'Table',
  name: 'Table',
  schema: TableSchema,
  defaultProps: {
    ...baseComponentDefaults,
    data: [
      ["Data 1", "Data 2", "Data 3"],
      ["Data 4", "Data 5", "Data 6"]
    ],
    headers: ["Column 1", "Column 2", "Column 3"],
    showHeader: true,
    tableStyles: {
      fontFamily: "Inter",
      fontSize: 18, // Larger for presentations
      borderColor: "#d1d5db", // Visible borders
      borderWidth: 2, // Thicker borders for clarity
      cellPadding: 16, // Generous padding
      headerBackgroundColor: "#1f2937", // Dark header (theme will override)
      headerTextColor: "#ffffff", // White text on dark header
      cellBackgroundColor: "#ffffff",
      textColor: "#1f2937", // Darker text for contrast
      alignment: "left",
      alternatingRowColor: true,
      hoverEffect: false, // No hover for presentations
      stripedRows: true, // Enable striped rows by default
      borderRadius: 0 // No rounded corners - clean, professional
    },
    cellStyles: [],
    width: 900, // Wider default for better visibility
    height: 450, // Taller default to accommodate larger text
    enableSorting: false,
    enableFiltering: false,
    resizableColumns: false
  },
  category: 'data'
}; 